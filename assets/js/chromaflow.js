/* eslint n/no-unsupported-features/node-builtins: "off" */
/* globals photoBooth photoboothTools chromaLivePreview chromaBackgrounds csrf */

/*
 * Two-button guest flow for the chroma capture page.
 *
 *   FUNCTION key (default right arrow): cycle / change
 *   SELECT key   (default left arrow):  select / confirm
 *
 * Phases:
 *   1. background  FUNCTION = next background, SELECT = start the photos
 *   2. shooting    countdown + photo, repeated keying.shot_count times
 *   3. pick        FUNCTION = next photo, SELECT = choose it
 *   4. copies      FUNCTION = +1 (wraps from max back to 0), SELECT = confirm
 *   5. done        thank you, then back to phase 1
 *
 * Photos are snapshots of the live keyed preview, so they look exactly like
 * what the guest saw. Only the chosen photo is uploaded and saved.
 */
const chromaFlow = (function () {
    const Phase = {
        BACKGROUND: 'background',
        SHOOTING: 'shooting',
        PICK: 'pick',
        COPIES: 'copies',
        DONE: 'done'
    };

    const api = {};
    const functionKey = () => parseInt(config.keying.next_background_key, 10);
    const selectKey = () => parseInt(config.keying.select_key, 10);
    const shotCount = () => Math.max(1, parseInt(config.keying.shot_count, 10) || 3);
    const shotPauseMs = () => Math.max(0, parseInt(config.keying.shot_pause, 10) || 0) * 1000;
    const maxCopies = () => Math.max(1, parseInt(config.keying.max_copies, 10) || 10);
    const countdownSeconds = () => Math.max(1, parseInt(config.picture.cntdwn_time, 10) || 3);

    let phase = Phase.BACKGROUND;
    let shots = [];
    let pickIndex = 0;
    let copies = 1;
    let savePromise = null;
    let $root, $shot, $pick, $copies, $done, $keys;

    // Labels of the two physical buttons per phase: A = select, B = function.
    const keyLabels = {
        [Phase.BACKGROUND]: ['chroma_flow_key_start', 'chroma_flow_key_next_background'],
        [Phase.PICK]: ['chroma_flow_key_choose', 'chroma_flow_key_next_photo'],
        [Phase.COPIES]: ['chroma_flow_key_confirm', 'chroma_flow_key_change']
    };

    // translations are fetched asynchronously after page load
    const t = (key) => (photoboothTools.translations ? photoboothTools.getTranslation(key) : key);
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function buildDom() {
        $root = $('<div class="chroma-flow"></div>').appendTo('body');
        $shot = $(
            '<div class="chroma-flow-panel chroma-flow-shot"><img alt=""><div class="chroma-flow-label"></div></div>'
        ).appendTo($root);
        $pick = $(
            '<div class="chroma-flow-panel chroma-flow-pick">' +
                '<div class="chroma-flow-title"></div>' +
                '<div class="chroma-flow-photos"></div>' +
                '</div>'
        ).appendTo($root);
        $copies = $(
            '<div class="chroma-flow-panel chroma-flow-copies">' +
                '<img class="chroma-flow-chosen" alt="">' +
                '<div class="chroma-flow-title"></div>' +
                '<div class="chroma-flow-numbers"></div>' +
                '</div>'
        ).appendTo($root);
        $done = $(
            '<div class="chroma-flow-panel chroma-flow-done"><div class="chroma-flow-title"></div></div>'
        ).appendTo($root);

        const key = (letter) =>
            '<button type="button" class="chroma-flow-key" data-key="' +
            letter.toLowerCase() +
            '"><span class="chroma-flow-keycap">' +
            letter +
            '</span><span class="chroma-flow-keylabel"></span></button>';
        $keys = $('<div class="chroma-flow-keys">' + key('A') + key('B') + '</div>').appendTo('body');
        $keys.find('[data-key="a"]').on('click', () => onSelect());
        $keys.find('[data-key="b"]').on('click', () => onFunction());
    }

    function applyTexts() {
        $pick.find('.chroma-flow-title').text(t('chroma_flow_pick'));
        $copies.find('.chroma-flow-title').text(t('chroma_flow_copies'));
        $done.find('.chroma-flow-title').text(t('chroma_flow_thanks'));
    }

    function updateKeys() {
        const labels = keyLabels[phase];
        $keys.toggleClass('active', Boolean(labels));
        if (labels) {
            $keys.find('[data-key="a"] .chroma-flow-keylabel').text(t(labels[0]));
            $keys.find('[data-key="b"] .chroma-flow-keylabel').text(t(labels[1]));
        }
    }

    function showPanel($panel) {
        applyTexts();
        $root.find('.chroma-flow-panel').removeClass('active');
        if ($panel) {
            $panel.addClass('active');
            $root.addClass('active');
        } else {
            $root.removeClass('active');
        }
    }

    function setPhase(next) {
        phase = next;
        photoboothTools.console.logDev('Chroma flow phase: ' + phase);
        // the A/B key bar replaces the old start stage buttons
        $('.stage--chroma').removeClass('stage--active');
        updateKeys();
    }

    // ---- phase 2: shooting ------------------------------------------------

    function countdown(seconds) {
        const element = document.createElement('div');
        element.classList.add('countdown');
        document.body.append(element);
        const audio = document.createElement('audio');
        document.body.append(audio);

        const show = (n) => {
            element.innerHTML = '';
            const number = document.createElement('div');
            number.classList.add('countdown-number');
            number.textContent = n.toString();
            element.appendChild(number);
            if (config.sound.enabled && config.sound.countdown_enabled) {
                const sound = photoboothTools.getSound('counter-' + n);
                if (sound !== null) {
                    audio.src = sound;
                    audio.play().catch(() => {
                        return;
                    });
                }
            }
        };

        return (async () => {
            for (let n = seconds; n > 0; n--) {
                show(n);
                await wait(1000);
            }
            element.remove();
            audio.remove();
        })();
    }

    function flash() {
        const element = document.createElement('div');
        element.classList.add('chroma-flow-flash');
        document.body.append(element);
        // the fade-out is a CSS animation; remove the element on a timer so it
        // can never stay on screen, even if the animation is throttled
        setTimeout(() => element.remove(), 450);
    }

    async function shoot() {
        setPhase(Phase.SHOOTING);
        shots = [];
        const total = shotCount();

        for (let i = 0; i < total; i++) {
            showPanel(null);
            await countdown(countdownSeconds());

            const frame = chromaLivePreview.snapshot();
            if (frame === null) {
                await fail(t('chroma_flow_no_camera'));
                return;
            }
            flash();
            shots.push(frame.toDataURL('image/jpeg', 0.92));
            photoboothTools.console.logDev('Chroma flow: took photo ' + (i + 1) + ' of ' + total);

            if (shotPauseMs() > 0) {
                $shot.find('img').attr('src', shots[i]);
                $shot.find('.chroma-flow-label').text(
                    total > 1
                        ? t('chroma_flow_shot')
                              .replace('%1', i + 1)
                              .replace('%2', total)
                        : ''
                );
                showPanel($shot);
                await wait(shotPauseMs());
            }
        }

        if (total === 1) {
            // single photo mode: nothing to choose
            pickIndex = 0;
            choosePhoto();
        } else {
            startPick();
        }
    }

    // ---- phase 3: pick a photo --------------------------------------------

    function startPick() {
        setPhase(Phase.PICK);
        pickIndex = 0;
        const $photos = $pick.find('.chroma-flow-photos').empty();
        shots.forEach((src, index) => {
            $('<img alt="">')
                .attr('src', src)
                .on('click', () => {
                    if (phase === Phase.PICK) {
                        pickIndex = index;
                        choosePhoto();
                    }
                })
                .appendTo($photos);
        });
        updatePick();
        showPanel($pick);
    }

    function updatePick() {
        $pick.find('.chroma-flow-photos img').removeClass('selected').eq(pickIndex).addClass('selected');
    }

    function choosePhoto() {
        savePromise = savePhoto(shots[pickIndex]);
        startCopies();
    }

    function savePhoto(dataUrl) {
        return new Promise((resolve, reject) => {
            $.ajax({
                method: 'POST',
                url: environment.publicFolders.api + '/chromakeying/save.php',
                data: {
                    imgData: dataUrl,
                    [csrf.key]: csrf.token
                }
            })
                .done((resp) => {
                    if (resp && resp.success && resp.filename) {
                        photoboothTools.console.log('Chroma flow: saved ' + resp.filename);
                        resolve(resp.filename);
                    } else {
                        reject(new Error((resp && resp.error) || 'Saving the photo failed'));
                    }
                })
                .fail((xhr, status) => reject(new Error('Saving the photo failed: ' + status)));
        });
    }

    // ---- phase 4: number of copies ----------------------------------------

    function startCopies() {
        setPhase(Phase.COPIES);
        copies = 1;
        $copies.find('.chroma-flow-chosen').attr('src', shots[pickIndex]);
        const $numbers = $copies.find('.chroma-flow-numbers').empty();
        // lets the stylesheet fit all numbers in one row
        $numbers.get(0).style.setProperty('--copies-count', (maxCopies() + 1).toString());
        for (let n = 0; n <= maxCopies(); n++) {
            $('<div class="chroma-flow-number"></div>')
                .text(n)
                .on('click', () => {
                    if (phase === Phase.COPIES) {
                        copies = n;
                        confirmCopies();
                    }
                })
                .appendTo($numbers);
        }
        updateCopies();
        showPanel($copies);
    }

    function updateCopies() {
        $copies.find('.chroma-flow-number').removeClass('selected').eq(copies).addClass('selected');
    }

    async function confirmCopies() {
        setPhase(Phase.DONE);
        showPanel($done);
        const started = Date.now();
        try {
            const filename = await savePromise;
            photoboothTools.console.log('Chroma flow: ' + copies + ' copies of ' + filename);
            if (copies > 0) {
                await printPhoto(filename, copies);
            }
            document.dispatchEvent(new CustomEvent('photobooth:copies', { detail: { filename, copies } }));
        } catch (error) {
            photoboothTools.console.log('ERROR: Chroma flow: ' + error.message);
            await fail(t('error'));
            return;
        }
        // show the thank you screen for at least 3 seconds
        await wait(Math.max(0, 3000 - (Date.now() - started)));
        photoboothTools.reloadPage();
    }

    // Uses the regular print API: it prepares the print file (print frame, text,
    // crop, ...) and either copies it into the hot folder once per copy or runs
    // the print command, depending on the print settings.
    function printPhoto(filename, count) {
        return new Promise((resolve, reject) => {
            $.ajax({
                method: 'GET',
                url: environment.publicFolders.api + '/print.php',
                data: {
                    filename: filename,
                    copies: count,
                    [csrf.key]: csrf.token
                },
                dataType: 'json'
            })
                .done((resp) => {
                    if (resp && resp.status !== 'error') {
                        photoboothTools.console.log('Chroma flow: printing ' + count + 'x ' + filename, resp);
                        resolve(resp);
                    } else {
                        reject(new Error((resp && resp.error) || 'Printing failed'));
                    }
                })
                .fail((xhr, status) => reject(new Error('Printing failed: ' + status)));
        });
    }

    // ---- errors -------------------------------------------------------------

    async function fail(message) {
        photoboothTools.console.log('ERROR: Chroma flow: ' + message);
        showPanel(null);
        photoboothTools.overlay.showError(message);
        await wait(3000);
        photoboothTools.overlay.close();
        photoboothTools.reloadPage();
    }

    // ---- input --------------------------------------------------------------

    function onFunction() {
        switch (phase) {
            case Phase.BACKGROUND:
                chromaBackgrounds.next();
                break;
            case Phase.PICK:
                pickIndex = (pickIndex + 1) % shots.length;
                updatePick();
                break;
            case Phase.COPIES:
                copies = (copies + 1) % (maxCopies() + 1);
                updateCopies();
                break;
            default:
                break;
        }
    }

    function onSelect() {
        switch (phase) {
            case Phase.BACKGROUND:
                if (chromaBackgrounds.count === 0) {
                    return;
                }
                if (!chromaLivePreview.isRunning()) {
                    photoboothTools.overlay.showError(t('chroma_flow_no_camera'));
                    setTimeout(() => photoboothTools.overlay.close(), 2000);
                    return;
                }
                startSession();
                break;
            case Phase.PICK:
                choosePhoto();
                break;
            case Phase.COPIES:
                confirmCopies();
                break;
            default:
                break;
        }
    }

    function startSession() {
        // keep core.js from reloading the page (time to live) mid-session
        photoBooth.takingPic = true;
        photoBooth.resetTimeOut();
        shoot().catch((error) => fail(error.message || 'Unexpected error'));
    }

    api.init = function () {
        if (typeof chromaLivePreview === 'undefined' || !chromaLivePreview.isSupported()) {
            photoboothTools.console.log('Chroma flow disabled: live keyed preview is not available.');
            return;
        }
        document.body.classList.add('chroma-flow-on');
        buildDom();
        setPhase(Phase.BACKGROUND);

        // translations load asynchronously: relabel the keys once they are there
        const relabel = setInterval(() => {
            if (photoboothTools.translations) {
                clearInterval(relabel);
                updateKeys();
            }
        }, 100);

        $(document).on('keydown', (ev) => {
            if (ev.repeat) {
                return;
            }
            if (ev.keyCode === functionKey()) {
                ev.preventDefault();
                onFunction();
            } else if (ev.keyCode === selectKey()) {
                ev.preventDefault();
                onSelect();
            }
        });

        // The on-screen Picture button acts as SELECT (replaces the single shot).
        $('[data-command="take-chroma"]')
            .off('click')
            .on('click', (ev) => {
                ev.preventDefault();
                onSelect();
            });

        photoboothTools.console.log('Chroma flow ready.');
    };

    return api;
})();

$(function () {
    chromaFlow.init();
});
