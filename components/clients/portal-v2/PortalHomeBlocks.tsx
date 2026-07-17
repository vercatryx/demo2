'use client';

import { useEffect, useState, type ElementType, type ReactNode } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { PortalHomeBlock, PortalHomePromoLinkTarget, PortalHomePromoSlide } from '@/lib/portal-home-blocks';
import {
    getPromoSlideDurationSeconds,
    getPromoSlideTransitionMs,
    getPromoSlides,
    promoBlockHasCarousel,
    promoLinkTargetHasLink,
} from '@/lib/portal-home-blocks';
import styles from './portal-home-blocks.module.css';

type Props = {
    blocks: PortalHomeBlock[];
    onBlockClick?: (block: PortalHomeBlock, link: PortalHomePromoLinkTarget) => void;
};

/** Render Markdown while keeping a single outer tag (avoids nested <p> in titles). */
function PromoMarkdown({
    as: Tag,
    className,
    children,
    unwrapParagraphs = false,
}: {
    as: ElementType;
    className?: string;
    children: string;
    unwrapParagraphs?: boolean;
}) {
    const components = unwrapParagraphs
        ? {
              p: ({ children: paragraphChildren }: { children?: ReactNode }) => <>{paragraphChildren}</>,
          }
        : undefined;

    return (
        <Tag className={className}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {children}
            </ReactMarkdown>
        </Tag>
    );
}

function BlockBody({
    slide,
    onBlockClick,
    lightText,
}: {
    slide: PortalHomePromoSlide;
    onBlockClick?: (link: PortalHomePromoLinkTarget) => void;
    lightText?: boolean;
}) {
    const hasLink = promoLinkTargetHasLink(slide);
    const ctaLabel = slide.ctaLabel?.trim() || 'Learn more';
    const title = slide.title.trim();
    const subtitle = slide.subtitle?.trim() || '';
    const body = slide.body?.trim() || '';

    return (
        <>
            {title ? (
                <PromoMarkdown as="h3" className={styles.portalHomeBlockTitle} unwrapParagraphs>
                    {title}
                </PromoMarkdown>
            ) : null}
            {subtitle ? (
                <PromoMarkdown as="div" className={styles.portalHomeBlockSubtitle} unwrapParagraphs>
                    {subtitle}
                </PromoMarkdown>
            ) : null}
            {body ? (
                <PromoMarkdown as="div" className={styles.portalHomeBlockBody}>
                    {body}
                </PromoMarkdown>
            ) : null}
            {hasLink && onBlockClick ? (
                <button
                    type="button"
                    className={styles.portalHomeBlockCta}
                    onClick={() => onBlockClick(slide)}
                    style={lightText ? undefined : undefined}
                >
                    {ctaLabel}
                </button>
            ) : null}
        </>
    );
}

function PortalHomePromoSlideCard({
    slide,
    onBlockClick,
    isActive,
    transitionMs,
}: {
    slide: PortalHomePromoSlide;
    onBlockClick?: (link: PortalHomePromoLinkTarget) => void;
    isActive: boolean;
    transitionMs: number;
}) {
    const imageUrl = slide.imageUrl?.trim() || null;
    const layout = imageUrl ? slide.imageLayout : 'none';
    const slideClassName = `${styles.portalHomeCarouselSlide} ${isActive ? styles.portalHomeCarouselSlideActive : ''}`;

    if (layout === 'background' && imageUrl) {
        return (
            <article
                className={`${styles.portalHomeBlock} ${styles.portalHomeBlockBackground} ${slideClassName}`}
                style={{ transitionDuration: `${transitionMs}ms` }}
                aria-hidden={!isActive}
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={imageUrl}
                    alt=""
                    className={styles.portalHomeBlockBackgroundImage}
                />
                <div className={styles.portalHomeBlockBackgroundOverlay}>
                    <BlockBody slide={slide} onBlockClick={onBlockClick} lightText />
                </div>
            </article>
        );
    }

    if (layout === 'side' && imageUrl) {
        return (
            <article
                className={`${styles.portalHomeBlock} ${styles.portalHomeBlockSide} ${slideClassName}`}
                style={{ transitionDuration: `${transitionMs}ms` }}
                aria-hidden={!isActive}
            >
                <div className={styles.portalHomeBlockSideImage}>
                    <Image src={imageUrl} alt="" fill sizes="280px" style={{ objectFit: 'cover' }} />
                </div>
                <div className={styles.portalHomeBlockSideBody}>
                    <BlockBody slide={slide} onBlockClick={onBlockClick} />
                </div>
            </article>
        );
    }

    return (
        <article
            className={`${styles.portalHomeBlock} ${styles.portalHomeBlockPlain} ${slideClassName}`}
            style={{ transitionDuration: `${transitionMs}ms` }}
            aria-hidden={!isActive}
        >
            <BlockBody slide={slide} onBlockClick={onBlockClick} />
        </article>
    );
}

function PortalHomePromoCarousel({
    block,
    slides,
    onBlockClick,
}: {
    block: PortalHomeBlock;
    slides: PortalHomePromoSlide[];
    onBlockClick?: (block: PortalHomeBlock, link: PortalHomePromoLinkTarget) => void;
}) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [autoAdvance, setAutoAdvance] = useState(true);
    const durationMs = getPromoSlideDurationSeconds(block) * 1000;
    const transitionMs = getPromoSlideTransitionMs(block);

    useEffect(() => {
        setActiveIndex(0);
        setAutoAdvance(true);
    }, [block.id, slides.length]);

    useEffect(() => {
        if (slides.length < 2 || !autoAdvance) return undefined;
        const timer = window.setInterval(() => {
            setActiveIndex((current) => (current + 1) % slides.length);
        }, durationMs);
        return () => window.clearInterval(timer);
    }, [slides.length, durationMs, block.id, autoAdvance]);

    const handleDotClick = (index: number) => {
        setActiveIndex(index);
        setAutoAdvance(false);
    };

    const handleSlideClick = onBlockClick
        ? (link: PortalHomePromoLinkTarget) => onBlockClick(block, link)
        : undefined;

    return (
        <div
            className={styles.portalHomeCarousel}
            aria-live="polite"
            aria-roledescription="carousel"
            aria-label={block.title.trim() || 'Promotional message'}
        >
            <div className={styles.portalHomeCarouselInner}>
                {slides.map((slide, index) => (
                    <PortalHomePromoSlideCard
                        key={slide.id}
                        slide={slide}
                        onBlockClick={handleSlideClick}
                        isActive={index === activeIndex}
                        transitionMs={transitionMs}
                    />
                ))}
            </div>
            {slides.length > 1 ? (
                <div className={styles.portalHomeCarouselDots} role="tablist" aria-label="Promo slides">
                    {slides.map((slide, index) => (
                        <button
                            key={slide.id}
                            type="button"
                            role="tab"
                            className={`${styles.portalHomeCarouselDot} ${index === activeIndex ? styles.portalHomeCarouselDotActive : ''}`}
                            aria-label={`Show slide ${index + 1}${slide.title.trim() ? `: ${slide.title.trim()}` : ''}`}
                            aria-selected={index === activeIndex}
                            onClick={() => handleDotClick(index)}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function PortalHomeBlockCard({
    block,
    onBlockClick,
}: {
    block: PortalHomeBlock;
    onBlockClick?: (block: PortalHomeBlock, link: PortalHomePromoLinkTarget) => void;
}) {
    const slides = getPromoSlides(block);

    if (promoBlockHasCarousel(block)) {
        return <PortalHomePromoCarousel block={block} slides={slides} onBlockClick={onBlockClick} />;
    }

    const slide = slides[0];
    const handleSlideClick = onBlockClick
        ? (link: PortalHomePromoLinkTarget) => onBlockClick(block, link)
        : undefined;

    return (
        <PortalHomePromoSlideCard
            slide={slide}
            onBlockClick={handleSlideClick}
            isActive
            transitionMs={getPromoSlideTransitionMs(block)}
        />
    );
}

export function PortalHomeBlocks({ blocks, onBlockClick }: Props) {
    if (blocks.length === 0) return null;

    return (
        <div className={styles.portalHomeBlocksList}>
            {blocks.map((block) => (
                <PortalHomeBlockCard key={block.id} block={block} onBlockClick={onBlockClick} />
            ))}
        </div>
    );
}
