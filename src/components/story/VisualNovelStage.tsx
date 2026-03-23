'use client';

import type { ReactNode } from 'react';

import styles from './VisualNovelStage.module.css';

type VisualNovelStageCharacter = {
    id: string;
    name: string;
    image_url: string | null;
};

type VisualNovelFocusSide = 'left' | 'right' | 'none';
type VisualNovelLayoutMode = 'stage' | 'split' | 'solo';

type VisualNovelSceneLike = {
    layoutMode?: VisualNovelLayoutMode;
    backgroundUrl?: string | null;
    leftCharacterId?: string | null;
    rightCharacterId?: string | null;
    soloCharacterId?: string | null;
    speakerCharacterId?: string | null;
    leftSceneImageUrl?: string | null;
    rightSceneImageUrl?: string | null;
    soloSceneImageUrl?: string | null;
    text: string;
    focusSide?: VisualNovelFocusSide;
};

type VisualNovelStageProps = {
    scene: VisualNovelSceneLike;
    characters: VisualNovelStageCharacter[];
    fallbackBackgroundUrl?: string | null;
    variant?: 'reader' | 'editor';
    className?: string;
    speakerFallback?: string;
    footerSlot?: ReactNode;
};

export function VisualNovelStage({
    scene,
    characters,
    fallbackBackgroundUrl = null,
    variant = 'reader',
    className,
    speakerFallback = 'ผู้บรรยาย',
    footerSlot = null,
}: VisualNovelStageProps) {
    const leftCharacter = characters.find((character) => character.id === scene.leftCharacterId) || null;
    const rightCharacter = characters.find((character) => character.id === scene.rightCharacterId) || null;
    const soloCharacter = characters.find((character) => character.id === scene.soloCharacterId) || null;
    const speakerCharacter = characters.find((character) => character.id === scene.speakerCharacterId) || null;
    const backgroundUrl = scene.backgroundUrl || fallbackBackgroundUrl || null;
    const requestedLayoutMode: VisualNovelLayoutMode = scene.layoutMode === 'split'
        ? 'split'
        : scene.layoutMode === 'solo'
            ? 'solo'
            : 'stage';
    const hasSplitVisuals = Boolean(scene.leftSceneImageUrl || scene.rightSceneImageUrl);
    const hasSoloVisual = Boolean(scene.soloSceneImageUrl);
    const effectiveLayoutMode: VisualNovelLayoutMode = requestedLayoutMode === 'split'
        ? (hasSplitVisuals || variant === 'editor' ? 'split' : 'stage')
        : requestedLayoutMode === 'solo'
            ? (hasSoloVisual || variant === 'editor' ? 'solo' : 'stage')
            : 'stage';
    const activeFocusSide: VisualNovelFocusSide = effectiveLayoutMode === 'solo'
        ? 'none'
        : scene.focusSide
        || (speakerCharacter && speakerCharacter.id === leftCharacter?.id
            ? 'left'
            : speakerCharacter && speakerCharacter.id === rightCharacter?.id
                ? 'right'
                : 'none');
    const dialogueText = scene.text.trim().length > 0
        ? scene.text
        : variant === 'editor'
            ? 'พิมพ์บทพูดของฉากนี้...'
            : '...';
    const speakerLabel = speakerCharacter?.name || speakerFallback;
    const stageClassName = [
        styles.stage,
        variant === 'editor' ? styles.editorStage : styles.readerStage,
        effectiveLayoutMode === 'split'
            ? styles.splitStage
            : effectiveLayoutMode === 'solo'
                ? styles.soloStage
                : styles.stageLayoutStage,
        className,
    ].filter(Boolean).join(' ');

    const renderPortrait = (
        side: 'left' | 'right',
        character: VisualNovelStageCharacter | null,
    ) => {
        const isFocused = activeFocusSide === 'none' || activeFocusSide === side;
        const slotClassName = [
            styles.portraitSlot,
            side === 'left' ? styles.leftSlot : styles.rightSlot,
            isFocused ? styles.portraitFocused : styles.portraitDimmed,
            !character ? styles.portraitEmpty : '',
        ].filter(Boolean).join(' ');

        return (
            <div className={slotClassName}>
                {character?.image_url ? (
                    <img
                        src={character.image_url}
                        alt={character.name}
                        className={styles.portraitImage}
                    />
                ) : character ? (
                    <div className={styles.portraitPlaceholder}>
                        <span className={styles.portraitInitial}>{character.name.slice(0, 1)}</span>
                        <span className={styles.portraitName}>{character.name}</span>
                    </div>
                ) : (
                    <div className={styles.portraitGhost} />
                )}
            </div>
        );
    };

    const renderSplitPanel = (
        side: 'left' | 'right',
        character: VisualNovelStageCharacter | null,
        imageUrl: string | null | undefined,
    ) => {
        const isFocused = activeFocusSide === 'none' || activeFocusSide === side;
        const panelClassName = [
            styles.splitPanel,
            side === 'left' ? styles.splitLeftPanel : styles.splitRightPanel,
            isFocused ? styles.splitPanelFocused : styles.splitPanelDimmed,
        ].filter(Boolean).join(' ');

        return (
            <div className={panelClassName}>
                {imageUrl ? (
                    <img
                        src={imageUrl}
                        alt={character?.name || (side === 'left' ? 'Left scene visual' : 'Right scene visual')}
                        className={styles.splitPanelImage}
                    />
                ) : (
                    <div className={styles.splitPanelPlaceholder}>
                        <span className={styles.splitPanelInitial}>
                            {(character?.name || (side === 'left' ? 'L' : 'R')).slice(0, 1)}
                        </span>
                        <span className={styles.splitPanelName}>
                            {character?.name || (side === 'left' ? 'ฝั่งซ้าย' : 'ฝั่งขวา')}
                        </span>
                        <span className={styles.splitPanelHint}>
                            {variant === 'editor' ? 'เพิ่มภาพฉากของฝั่งนี้' : 'ยังไม่มีภาพฉาก'}
                        </span>
                    </div>
                )}
                <div className={styles.splitPanelShade} />
            </div>
        );
    };

    const renderSoloPanel = (
        character: VisualNovelStageCharacter | null,
        imageUrl: string | null | undefined,
    ) => (
        <div className={styles.soloLayer}>
            <div className={styles.soloFrame}>
                {imageUrl ? (
                    <img
                        src={imageUrl}
                        alt={character?.name || 'Solo scene visual'}
                        className={styles.soloImage}
                    />
                ) : (
                    <div className={styles.soloPlaceholder}>
                        <span className={styles.soloInitial}>
                            {(character?.name || 'S').slice(0, 1)}
                        </span>
                        <span className={styles.soloName}>
                            {character?.name || 'ฉากเดี่ยว'}
                        </span>
                        <span className={styles.soloHint}>
                            {variant === 'editor' ? 'เพิ่มภาพฉากเดี่ยวของ scene นี้' : 'ยังไม่มีภาพฉากเดี่ยว'}
                        </span>
                    </div>
                )}
                <div className={styles.soloShade} />
            </div>
        </div>
    );

    return (
        <section className={stageClassName}>
            {effectiveLayoutMode === 'split' ? (
                <>
                    <div className={styles.splitBackdrop} />
                    <div className={styles.splitLayer}>
                        {renderSplitPanel('left', leftCharacter, scene.leftSceneImageUrl)}
                        {renderSplitPanel('right', rightCharacter, scene.rightSceneImageUrl)}
                    </div>
                    <div className={styles.splitDivider} />
                </>
            ) : effectiveLayoutMode === 'solo' ? (
                <>
                    <div className={styles.soloBackdrop} />
                    {renderSoloPanel(soloCharacter, scene.soloSceneImageUrl)}
                </>
            ) : (
                <>
                    <div
                        className={styles.background}
                        style={backgroundUrl ? { backgroundImage: `url(${backgroundUrl})` } : undefined}
                    />
                    <div className={styles.backgroundShade} />
                    <div className={styles.ambientGlow} />

                    <div className={styles.characterLayer}>
                        {renderPortrait('left', leftCharacter)}
                        {renderPortrait('right', rightCharacter)}
                    </div>
                </>
            )}

            <div className={styles.dialogueDock}>
                <div className={styles.dialogueBox}>
                    <div className={styles.dialogueHeader}>
                        <span className={styles.speakerTag}>{speakerLabel}</span>
                        {footerSlot}
                    </div>
                    <p className={styles.dialogueText}>{dialogueText}</p>
                </div>
            </div>
        </section>
    );
}
