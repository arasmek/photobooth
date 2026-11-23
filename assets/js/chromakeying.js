/* globals photoBooth MarvinColorModelConverter AlphaBoundary MarvinImage Seriously initRemoteBuzzerFromDOM photoboothTools csrf */
/* exported setChromaImage processChromaImage chromaBackgrounds chromaLivePreview */
let mainImage;
let mainImageWidth;
let mainImageHeight;
let backgroundImage;
let seriously;
let target;
let chroma;
let seriouslyimage;
let needsReload = false;
// Filled in on the chroma capture page once the backgrounds are known.
const chromaBackgrounds = {
    count: 0,
    next: () => {
        return;
    }
};
const notificationTimeout = config.ui.notification_timeout * 1000;

const chromaCanvas = document.getElementById('chromaCanvas');
const chromaCanvasContext = chromaCanvas.getContext ? chromaCanvas.getContext('2d') : null;

function greenToTransparency(imageIn, imageOut) {
    for (let y = 0; y < imageIn.getHeight(); y++) {
        for (let x = 0; x < imageIn.getWidth(); x++) {
            const color = imageIn.getIntColor(x, y);
            const hsv = MarvinColorModelConverter.rgbToHsv([color]);

            if (hsv[0] >= 60 && hsv[0] <= 200 && hsv[1] >= 0.2 && hsv[2] >= 0.2) {
                imageOut.setIntColor(x, y, 0, 127, 127, 127);
            } else {
                imageOut.setIntColor(x, y, color);
            }
        }
    }
}

function reduceGreen(image) {
    for (let y = 0; y < image.getHeight(); y++) {
        for (let x = 0; x < image.getWidth(); x++) {
            const r = image.getIntComponent0(x, y);
            const g = image.getIntComponent1(x, y);
            const b = image.getIntComponent2(x, y);
            const color = image.getIntColor(x, y);
            const hsv = MarvinColorModelConverter.rgbToHsv([color]);

            if (hsv[0] >= 60 && hsv[0] <= 130 && hsv[1] >= 0.15 && hsv[2] >= 0.15) {
                if (r * b != 0 && (g * g) / (r * b) > 1.5) {
                    image.setIntColor(x, y, 255, r * 1.4, g, b * 1.4);
                } else {
                    image.setIntColor(x, y, 255, r * 1.2, g, b * 1.2);
                }
            }
        }
    }
}

function alphaBoundary(imageOut, radius) {
    const ab = new AlphaBoundary();
    for (let y = 0; y < imageOut.getHeight(); y++) {
        for (let x = 0; x < imageOut.getWidth(); x++) {
            ab.alphaRadius(imageOut, x, y, radius);
        }
    }
}

// Apply the configured Seriously.js chroma settings. Shared by the still image
// keying and the live preview so both look the same.
function applyChromaSettings(effect) {
    const color = config.keying.seriouslyjs_color;
    const r = parseInt(color.substr(1, 2), 16) / 255;
    const g = parseInt(color.substr(3, 2), 16) / 255;
    const b = parseInt(color.substr(5, 2), 16) / 255;
    photoboothTools.console.logDev('Chromakeying color:', color);
    effect.screen = [r, g, b, 1];

    const numberSetting = (key, fallback) => {
        const value = parseFloat(config.keying[key]);
        return isNaN(value) ? fallback : value;
    };
    effect.weight = numberSetting('seriouslyjs_weight', 1);
    effect.balance = numberSetting('seriouslyjs_balance', 1);
    effect.clipBlack = numberSetting('seriouslyjs_clip_black', 0);
    effect.clipWhite = numberSetting('seriouslyjs_clip_white', 1);
}

// Draw an image so it covers the whole target area, cropping from the center.
function drawImageCover(ctx, img, width, height) {
    const scale = Math.max(width / img.width, height / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
}

function processChromaImage(imgSrc, save = false, filename = '') {
    if (config.keying.variant === 'marvinj') {
        const image = new MarvinImage();
        image.load(imgSrc, function () {
            mainImageWidth = image.getWidth();
            mainImageHeight = image.getHeight();

            const imageOut = new MarvinImage(image.getWidth(), image.getHeight());

            //1. Convert green to transparency
            greenToTransparency(image, imageOut);

            // 2. Reduce remaining green pixels
            reduceGreen(imageOut);

            // 3. Apply alpha to the boundary
            alphaBoundary(imageOut, 6);

            const tmpCanvas = document.createElement('canvas');
            tmpCanvas.width = mainImageWidth;
            tmpCanvas.height = mainImageHeight;
            imageOut.draw(tmpCanvas);

            mainImage = new Image();
            mainImage.src = tmpCanvas.toDataURL('image/png');
            mainImage.onload = function () {
                drawCanvas(save, filename);
            };
        });
    } else {
        const image = new Image();
        image.src = imgSrc;
        image.onload = function () {
            mainImageWidth = image.width;
            mainImageHeight = image.height;

            // create tmpcanvas and size it to image size
            const tmpCanvas = document.createElement('canvas');
            tmpCanvas.width = mainImageWidth;
            tmpCanvas.height = mainImageHeight;
            tmpCanvas.id = 'tmpimageout';

            // append Canvas for Seriously to chromakey the image
            // eslint-disable-next-line no-unused-vars
            const body = document.getElementsByTagName('body')[0];
            document.body.appendChild(tmpCanvas);

            seriously = new Seriously();
            target = seriously.target('#tmpimageout');
            seriouslyimage = seriously.source(image);
            chroma = seriously.effect('chroma');
            chroma.source = seriouslyimage;
            target.source = chroma;
            applyChromaSettings(chroma);
            seriously.go();
            mainImage = new Image();
            mainImage.src = tmpCanvas.toDataURL('image/png');

            mainImage.onload = function () {
                drawCanvas(save, filename);
            };
        };
        image.src = imgSrc;
    }
}

function setChromaImage(url) {
    backgroundImage = new Image();
    backgroundImage.src = url;
    backgroundImage.onload = function () {
        drawCanvas();
    };
}

function drawCanvas(save = false, filename = '') {
    if (typeof mainImage !== 'undefined' && mainImage !== null) {
        chromaCanvas.width = mainImage.width;
        chromaCanvas.height = mainImage.height;
    } else if (typeof backgroundImage !== 'undefined' && backgroundImage !== null) {
        chromaCanvas.width = backgroundImage.width;
        chromaCanvas.height = backgroundImage.height;
    }

    // Clear the canvas
    chromaCanvasContext.clearRect(0, 0, chromaCanvas.width, chromaCanvas.height);

    if (typeof backgroundImage !== 'undefined' && backgroundImage !== null) {
        if (typeof mainImage !== 'undefined' && mainImage !== null) {
            // Cover the whole photo (same as the live preview) instead of
            // leaving uncovered areas when the aspect ratios differ.
            drawImageCover(chromaCanvasContext, backgroundImage, mainImage.width, mainImage.height);
        } else {
            chromaCanvasContext.drawImage(backgroundImage, 0, 0, backgroundImage.width, backgroundImage.height);
        }
    }

    if (typeof mainImage !== 'undefined' && mainImage !== null) {
        if (config.keying.variant === 'marvinj') {
            chromaCanvasContext.drawImage(mainImage, 0, 0);
        } else {
            //important to fetch tmpimageout
            chromaCanvasContext.drawImage(document.getElementById('tmpimageout'), 0, 0);
        }
        if (save) {
            saveImage(filename);
        }
    }
}

function clearCanvasAndLoadImage(imageUrl) {
    // Clear the canvas
    chromaCanvasContext.clearRect(0, 0, chromaCanvas.width, chromaCanvas.height);

    // Create a new image element
    const newImage = new Image();

    // Set the onload event handler to execute code after the image is loaded
    newImage.onload = function () {
        chromaCanvas.width = newImage.width;
        chromaCanvas.height = newImage.height;
        chromaCanvasContext.drawImage(newImage, 0, 0);
    };

    // Set the source of the image to the specified URL
    newImage.src = imageUrl;
}

function saveImage(filename, cb) {
    const dataURL = chromaCanvas.toDataURL('image/png');
    $.ajax({
        method: 'POST',
        url: environment.publicFolders.api + '/chromakeying/save.php',
        data: {
            imgData: dataURL,
            file: filename,
            [csrf.key]: csrf.token
        },
        success: (resp) => {
            if (typeof onCaptureChromaView === 'undefined') {
                setTimeout(function () {
                    photoboothTools.overlay.close();
                    $('[data-command="save-chroma-btn"]').trigger('blur');
                }, notificationTimeout);
            } else {
                photoBooth.takingPic = false;
                needsReload = true;
                photoBooth.chromaimage = resp.filename;
                clearCanvasAndLoadImage(environment.publicFolders.images + '/' + resp.filename);

                if (config.picture.allow_delete) {
                    $('[data-command="deletebtn"]')
                        .off('click')
                        .on('click', async (ev) => {
                            ev.preventDefault();

                            const msg = photoboothTools.getTranslation('really_delete_image');
                            const really = config.delete.no_request
                                ? true
                                : await photoboothTools.confirm(resp.filename + ' ' + msg);
                            if (really) {
                                photoBooth.deleteImage(resp.filename, (result) => {
                                    if (result.success && config.keying.show_all) {
                                        photoBooth.deleteImage(photoBooth.filename, () => {
                                            setTimeout(function () {
                                                photoboothTools.reloadPage();
                                            }, notificationTimeout);
                                        });
                                    } else {
                                        setTimeout(function () {
                                            photoboothTools.reloadPage();
                                        }, notificationTimeout);
                                    }
                                });
                            } else {
                                $('.deletebtn').trigger('blur');
                            }
                        });
                }
                if (resp.filename) {
                    // Add Image to gallery and slider
                    photoBooth.addImage(resp.filename);
                }
                $('[data-command="print-btn"]').on('click', (event) => {
                    event.preventDefault();
                    if (photoboothTools.isPrinting) {
                        photoboothTools.console.log('Printing already in progress!');
                    } else {
                        photoboothTools.printImage(resp.filename, 1, () => {
                            $('[data-command="print-btn"]').trigger('blur');
                        });
                    }
                });
                $('[data-command="qrbtn"]')
                    .off('click')
                    .on('click', (event) => {
                        event.preventDefault();
                        photoBooth.showQrCode(resp.filename);
                    });
            }
            if (cb) {
                cb(resp);
            }
        },
        error: (jqXHR, textStatus) => {
            photoboothTools.console.log(textStatus);
            setTimeout(function () {
                photoboothTools.reloadPage();
            }, notificationTimeout);
        }
    });
}

/*
 * Live keyed preview for the chroma capture page.
 *
 * The device cam <video> is keyed with Seriously.js (WebGL) and drawn on top of
 * the selected background into a canvas that sits exactly where the video is.
 * The video itself is made invisible but keeps playing, so core.js can still
 * show/hide it and grab the photo from it as before.
 */
const chromaLivePreview = (function () {
    const api = {};
    const video = document.getElementById('preview--video');
    let liveCanvas = null;
    let liveContext = null;
    let glCanvas = null;
    let liveSeriously = null;
    let liveTarget = null;
    let running = false;

    api.isSupported = function () {
        return (
            typeof onCaptureChromaView !== 'undefined' &&
            config.keying.live_preview &&
            config.keying.variant === 'seriouslyjs' &&
            config.preview.mode === 'device_cam' &&
            typeof Seriously !== 'undefined' &&
            video !== null
        );
    };

    function setup() {
        glCanvas = document.createElement('canvas');
        liveCanvas = document.createElement('canvas');
        liveCanvas.id = 'preview--chroma';
        liveContext = liveCanvas.getContext('2d');
        // Layout (size, position, fit) comes from the .chroma-live-canvas styles.
        // Placed outside #preview-container, whose transform would otherwise
        // confine a fixed element to its box.
        liveCanvas.classList.add('chroma-live-canvas');
        liveCanvas.style.display = 'none';
        const previewElement = video.closest('.preview') || video;
        previewElement.before(liveCanvas);

        liveSeriously = new Seriously();
        const source = liveSeriously.source(video);
        const effect = liveSeriously.effect('chroma');
        applyChromaSettings(effect);
        effect.source = source;
        liveTarget = liveSeriously.target(glCanvas);
        liveTarget.source = effect;
    }

    function isActive() {
        return (
            typeof backgroundImage !== 'undefined' &&
            backgroundImage !== null &&
            backgroundImage.complete &&
            backgroundImage.naturalWidth > 0 &&
            video.srcObject &&
            video.videoWidth > 0 &&
            $(video).is(':visible')
        );
    }

    function drawFrame() {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (liveCanvas.width !== width || liveCanvas.height !== height) {
            liveCanvas.width = glCanvas.width = width;
            liveCanvas.height = glCanvas.height = height;
            liveTarget.width = width;
            liveTarget.height = height;
            // lets the stylesheet size the camera box (and its border) exactly
            document.documentElement.style.setProperty('--chroma-camera-ratio', (width / height).toString());
        }

        liveContext.setTransform(1, 0, 0, 1, 0, 0);
        drawImageCover(liveContext, backgroundImage, width, height);

        const flip = config.preview.flip;
        const flipX = flip === 'flip-horizontal' || flip === 'flip-both' ? -1 : 1;
        const flipY = flip === 'flip-vertical' || flip === 'flip-both' ? -1 : 1;
        liveContext.setTransform(flipX, 0, 0, flipY, flipX < 0 ? width : 0, flipY < 0 ? height : 0);
        liveContext.drawImage(glCanvas, 0, 0, width, height);
    }

    function tick() {
        if (isActive()) {
            if (!running) {
                running = true;
                liveSeriously.go();
                // keep the preview rotation setting (flip is applied when drawing,
                // so only the person gets mirrored, not the background)
                liveCanvas.style.rotate = window.getComputedStyle(video).rotate;
                liveCanvas.style.display = 'block';
                // keep the video playing (it is the keying source and the
                // capture source), but only show the keyed canvas
                video.style.opacity = '0';
            }
            drawFrame();
        } else if (running) {
            running = false;
            liveSeriously.stop();
            video.style.opacity = '';
            liveCanvas.style.display = 'none';
        }
        window.requestAnimationFrame(tick);
    }

    api.isRunning = function () {
        return running;
    };

    // Return a copy of the current keyed frame (background + person) at
    // camera resolution, or null if the live preview is not running.
    api.snapshot = function () {
        if (!running || !isActive()) {
            return null;
        }
        drawFrame();
        const copy = document.createElement('canvas');
        copy.width = liveCanvas.width;
        copy.height = liveCanvas.height;
        copy.getContext('2d').drawImage(liveCanvas, 0, 0);
        return copy;
    };

    api.init = function () {
        if (!api.isSupported()) {
            return;
        }
        try {
            setup();
        } catch (error) {
            photoboothTools.console.log('ERROR: Chroma live preview not available:', error);
            return;
        }
        photoboothTools.console.logDev('Chroma live preview initialized.');
        window.requestAnimationFrame(tick);
    };

    return api;
})();

$(document).on('keyup', function (ev) {
    if (
        typeof onCaptureChromaView === 'undefined' &&
        config.print.from_chromakeying &&
        config.print.key &&
        parseInt(config.print.key, 10) === ev.keyCode
    ) {
        if (photoboothTools.isPrinting) {
            photoboothTools.console.log('Printing already in progress!');
        } else {
            $('[data-command="print-btn"]').trigger('click');
        }
    } else if (
        typeof onCaptureChromaView != 'undefined' &&
        ((config.picture.key && parseInt(config.picture.key, 10) === ev.keyCode) ||
            (config.collage.key && parseInt(config.collage.key, 10) === ev.keyCode))
    ) {
        if (!backgroundImage) {
            photoboothTools.console.logDev('Please choose a background first!');
            photoboothTools.overlay.showError(photoboothTools.getTranslation('chroma_needs_background'));
            setTimeout(() => photoboothTools.overlay.close(), 1000);
        } else if (needsReload) {
            photoboothTools.console.logDev('Please reload the page to take a new Picture!');
            photoboothTools.overlay.showError(photoboothTools.getTranslation('chroma_needs_reload'));
            setTimeout(() => photoboothTools.overlay.close(), 1000);
        } else if (!photoBooth.takingPic) {
            if (config.collage.key && parseInt(config.collage.key, 10) === ev.keyCode) {
                photoboothTools.console.logDev(
                    'Collage key pressed. Not possible on live chroma, triggering photo now.'
                );
            }
            photoBooth.thrill('chroma');
        } else if (config.dev.loglevel > 0 && photoBooth.takingPic) {
            photoboothTools.console.log('Taking photo already in progress!');
        }
    }
});

$(function () {
    const $chromaStage = $('.stage[data-stage="start"]');
    const $chromaActions = $chromaStage.find('.buttonbar.buttonbar--bottom');
    const $chromaMessage = $chromaStage.find('.stage-message');

    if (typeof onCaptureChromaView === 'undefined') {
        $('[data-command="save-chroma-btn"]').on('click', (event) => {
            event.preventDefault();
            photoboothTools.overlay.show(photoboothTools.getTranslation('saving'));
            saveImage();
        });
        $('[data-command="print-btn"]').on('click', (event) => {
            event.preventDefault();
            setTimeout(function () {
                saveImage('', (resp) => {
                    if (!resp.success) {
                        return;
                    }
                    photoboothTools.printImage(resp.filename, 1, () => {
                        $('[data-command="print-btn"]').trigger('blur');
                    });
                });
            }, 1000);
        });
        $('[data-command="close-btn"]').on('click', (event) => {
            event.preventDefault();
            if (document.referrer) {
                window.location = document.referrer;
            } else {
                window.history.back();
            }
        });

        setTimeout(function () {
            processChromaImage($('body').attr('data-main-image'));
        }, 100);

        initRemoteBuzzerFromDOM();
    } else {
        const $backgrounds = $('.chroma-background-selector-image');
        let backgroundIndex = -1;

        const selectBackground = (index) => {
            backgroundIndex = index;
            setChromaImage($backgrounds.get(index).src);
            $chromaMessage.addClass('hidden');
            $chromaActions.removeClass('hidden');
        };

        $backgrounds.on('click', function () {
            backgroundIndex = $backgrounds.index(this);
            $chromaMessage.addClass('hidden');
            $chromaActions.removeClass('hidden');
        });

        // Backgrounds are cycled with a single key instead of being picked
        // from thumbnails, so hide the selector and the "choose" message.
        $('.chroma-background-selector').addClass('hidden');
        $chromaMessage.addClass('hidden');

        if ($backgrounds.length > 0) {
            selectBackground(0);
        } else {
            $chromaActions.addClass('hidden');
        }

        // Next background: only goes forward and wraps around, so one button is
        // enough. Called by the guest flow (chromaflow.js) on the function key.
        chromaBackgrounds.count = $backgrounds.length;
        chromaBackgrounds.next = () => {
            if ($backgrounds.length > 0) {
                selectBackground((backgroundIndex + 1) % $backgrounds.length);
            }
        };

        $('[data-command="take-chroma"]').on('click', (event) => {
            event.preventDefault();
            if (photoBooth.takingPic) {
                photoboothTools.console.logDev('Taking picture in progress already!');
                return;
            }
            photoBooth.thrill('chroma');
        });

        chromaLivePreview.init();

        photoboothTools.console.log('[CHROMA CAPTURE] DOM ready');
    }
});
