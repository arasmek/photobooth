/* eslint n/no-unsupported-features/node-builtins: "off" */
/* globals photoboothTools */

/*
 * Camera picker for the "preview[camera_label]" setting.
 *
 * The setting stores the camera name (device labels stay the same across
 * browser data resets, device ids do not). The text input stays in the form,
 * hidden, and is filled from a dropdown of the cameras the browser can see.
 */
(function () {
    const input = document.querySelector('input[name="preview[camera_label]"]');
    if (!input || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return;
    }

    const fallbackTexts = {
        camera_default: 'Default camera',
        camera_detect: 'Detect cameras',
        camera_not_connected: 'not connected'
    };
    const t = (key) =>
        photoboothTools.translations && photoboothTools.translations[key]
            ? photoboothTools.translations[key]
            : fallbackTexts[key];

    const select = document.createElement('select');
    select.className = 'w-full h-10 border-2 border-solid border-gray-300 focus:border-brand-1 rounded-md px-3 mt-auto';

    const detect = document.createElement('button');
    detect.type = 'button';
    detect.className = 'mt-2 text-sm text-brand-1 underline self-start';

    input.type = 'hidden';
    input.after(select, detect);

    function addOption(value, text) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        select.appendChild(option);
    }

    async function listCameras() {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter((device) => device.kind === 'videoinput' && device.label !== '').map((d) => d.label);
    }

    async function render() {
        const current = input.value;
        let names = [];
        try {
            names = await listCameras();
        } catch (error) {
            photoboothTools.console.log('Camera select: could not list cameras', error);
        }

        select.innerHTML = '';
        addOption('', t('camera_default'));
        names.forEach((name) => addOption(name, name));
        if (current !== '' && !names.includes(current)) {
            // keep the saved choice visible even if that camera is unplugged right now
            addOption(current, current + ' (' + t('camera_not_connected') + ')');
        }
        select.value = current;
        detect.textContent = t('camera_detect');
    }

    // Camera names are only visible after camera access was allowed once.
    async function requestAccessAndRender() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            stream.getTracks().forEach((track) => track.stop());
        } catch (error) {
            photoboothTools.console.log('Camera select: camera access denied', error);
        }
        await render();
    }

    select.addEventListener('change', () => {
        input.value = select.value;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    detect.addEventListener('click', requestAccessAndRender);

    render();
})();
