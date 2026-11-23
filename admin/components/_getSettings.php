<?php

use Photobooth\Service\LanguageService;
use Photobooth\Utility\AdminInput;

$languageService = LanguageService::getInstance();

foreach ($configsetup as $section => $fields) {

    // hidden
    $hiddenSection = 'visible';
    $sectionId = 'id="' . $section . '"';
    if (isElementHidden('setting_section ', $fields) == 'hidden') {
        $sectionId = '';
        $hiddenSection = 'hidden';
    }

    // section container
    echo '<div class="adminSection mb-8 ' . $hiddenSection . '" ' . $sectionId . '>';

    // headline
    echo '<h1 class="text-brand-1 text-xl font-bold pt-4 px-4 lg:pt-8 lg:px-8 mb-4">' . $languageService->translate($section) . '</h1>';

    // grid
    echo '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-8 px-4 lg:px-8">';

    $col = 0;
    foreach ($fields as $key => $setting) {
        if (in_array($key, ['platform', 'view', 'i18n_section'])) {
            continue;
        }

        $hidden = '';
        if (isElementHidden('setting_element', $setting) == 'hidden') {
            $hidden = 'hidden';
        }

        // Label / manual key. Settings moved to another section keep their
        // original key ('i18n' per setting or 'i18n_section' per section),
        // so existing translations still apply.
        $i18ntag = $setting['i18n'] ?? (($fields['i18n_section'] ?? $section) . ':' . $key);
        echo '<!-- ' . strtoupper($setting['type']) . ' ' . strtoupper($setting['name']) . ' -->';
        echo '<div class="adminSettingCard relative flex flex-col rounded-xl p-3 shadow-xl bg-white ' . $hidden . '" id="' . $i18ntag . '">';

        $isThemeField = ($setting['data-theme-field'] ?? '') === 'true' || ($setting['data-theme-field'] ?? false) === true;
        AdminInput::setThemeFieldFlag($isThemeField);

        // Populate setting elements by type

        switch ($setting['type']) {
            case 'icon':
                echo AdminInput::renderIcon($setting, $i18ntag);
                break;
            case 'input':
            case 'number':
                echo AdminInput::renderInput($setting, $i18ntag);
                break;
            case 'range':
                echo AdminInput::renderRange($setting, $i18ntag);
                break;
            case 'color':
                echo AdminInput::renderColor($setting, $i18ntag);
                break;
            case 'hidden':
                echo AdminInput::renderHidden($setting);
                break;
            case 'checkbox':
                echo AdminInput::renderCheckbox($setting, $i18ntag);
                break;
            case 'toggle-button-group':
                echo AdminInput::renderToggleButtonGroup($setting, $i18ntag);
                break;
            case 'toggle-button-group-modal':
                echo AdminInput::renderToggleButtonGroupModal($setting, $i18ntag);
                break;
            case 'multi-select':
            case 'select':
                echo AdminInput::renderSelect($setting, $i18ntag);
                break;
            case 'button':
                echo AdminInput::renderButton($setting, $i18ntag, $key, $config);
                break;
            case 'image':
                echo AdminInput::renderImageSelect($setting, $i18ntag);
                break;
            case 'font':
                echo AdminInput::renderFontSelect($setting, $i18ntag);
                break;
            case 'video':
                echo AdminInput::renderVideoSelect($setting, $i18ntag);
                break;
            case 'list':
                echo AdminInput::renderList($setting, $i18ntag);
                break;
            case 'theme':
                echo AdminInput::renderTheme($setting, 'theme_title');
                break;
        }

        echo '</div>';
    }
    echo '</div>';
    echo '</div>';
}
