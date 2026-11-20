<?php

namespace Photobooth\Configuration\Section;

use Symfony\Component\Config\Definition\Builder\NodeDefinition;
use Symfony\Component\Config\Definition\Builder\TreeBuilder;

final class KeyingConfiguration
{
    public static function getNode(): NodeDefinition
    {
        return (new TreeBuilder('keying'))->getRootNode()->addDefaultsIfNotSet()
            ->ignoreExtraKeys()
            ->children()
                ->booleanNode('enabled')->defaultValue(false)->end()
                ->enumNode('size')
                    ->values(['1000px', '1500px', '2000px', '2500px'])
                    ->defaultValue('1500px')
                    ->end()
                ->enumNode('variant')
                    ->values(['marvinj', 'seriouslyjs'])
                    ->defaultValue('seriouslyjs')
                    ->end()
                ->scalarNode('seriouslyjs_color')->defaultValue('#62af74')->end()
                ->floatNode('seriouslyjs_weight')->min(0)->max(2)->defaultValue(1)->end()
                ->floatNode('seriouslyjs_balance')->min(0)->max(1)->defaultValue(1)->end()
                ->floatNode('seriouslyjs_clip_black')->min(0)->max(1)->defaultValue(0)->end()
                ->floatNode('seriouslyjs_clip_white')->min(0)->max(1)->defaultValue(1)->end()
                ->booleanNode('live_preview')->defaultValue(true)->end()
                ->scalarNode('next_background_key')
                    ->info('key code that switches to the next background on the chroma capture page (39 = right arrow)')
                    ->defaultValue('39')
                    ->end()
                ->scalarNode('select_key')
                    ->info('key code that selects / confirms on the chroma capture page (37 = left arrow)')
                    ->defaultValue('37')
                    ->end()
                ->integerNode('shot_count')->min(1)->max(6)->defaultValue(3)->end()
                ->integerNode('shot_pause')->min(0)->max(10)->defaultValue(2)->end()
                ->integerNode('max_copies')->min(1)->max(20)->defaultValue(10)->end()
                ->booleanNode('private_backgrounds')->defaultValue(false)->end()
                ->booleanNode('show_all')->defaultValue(false)->end()
            ->end();
    }
}
