<?php

namespace Photobooth\Utility;

/**
 * Print by dropping files into a "hot folder" that the printer software watches.
 */
class HotFolderUtility
{
    /**
     * Copy a print file into the hot folder once per copy.
     *
     * Each copy is written under a temporary ".part" name first and then
     * renamed, so the printer software never picks up a half-written file.
     *
     * @return string[] paths of the files written to the hot folder
     */
    public static function copyToHotFolder(string $printFile, string $hotFolder, int $copies, string $baseName): array
    {
        if ($copies < 1) {
            return [];
        }

        $folder = rtrim($hotFolder, '/\\');
        if ($folder === '' || !is_dir($folder)) {
            throw new \Exception('Print hot folder does not exist: ' . $hotFolder);
        }
        if (!is_writable($folder)) {
            throw new \Exception('Print hot folder is not writable: ' . $hotFolder);
        }
        if (!is_file($printFile)) {
            throw new \Exception('Print file not found: ' . $printFile);
        }

        $name = pathinfo($baseName, PATHINFO_FILENAME);
        $extension = pathinfo($printFile, PATHINFO_EXTENSION) ?: 'jpg';

        $written = [];
        for ($i = 1; $i <= $copies; $i++) {
            $target = $folder . DIRECTORY_SEPARATOR . sprintf('%s-%d.%s', $name, $i, $extension);
            $partial = $target . '.part';
            if (!copy($printFile, $partial)) {
                throw new \Exception('Could not write to print hot folder: ' . $partial);
            }
            if (!rename($partial, $target)) {
                @unlink($partial);
                throw new \Exception('Could not finish file in print hot folder: ' . $target);
            }
            $written[] = $target;
        }

        return $written;
    }
}
