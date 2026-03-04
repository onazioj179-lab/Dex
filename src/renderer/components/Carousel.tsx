/**
 * DEX Carousel Component
 * Sliding content carousel
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';

// ==================== TYPES ====================

interface CarouselProps {
  children: React.ReactNode[];
  autoPlay?: boolean;
  autoPlayInterval?: number;
  showArrows?: boolean;
  showDots?: boolean;
  infinite?: boolean;
  slidesPerView?: number;
  gap?: number;
  pauseOnHover?: boolean;
  onChange?: (index: number) => void;
}

interface CarouselSlide {
  content: React.ReactNode;
  id?: string;
}

interface ImageCarouselProps {
  images: Array<{
    src: string;
    alt?: string;
    caption?: string;
  }>;
  aspectRatio?: number;
  showThumbnails?: boolean;
  autoPlay?: boolean;
  autoPlayInterval?: number;
}

interface TestimonialCarouselProps {
  testimonials: Array<{
    content: string;
    author: string;
    role?: string;
    avatar?: string;
    rating?: number;
  }>;
  autoPlay?: boolean;
}

// ==================== CAROUSEL ====================

export const Carousel: React.FC<CarouselProps> = ({
  children,
  autoPlay = false,
  autoPlayInterval = 5000,
  showArrows = true,
  showDots = true,
  infinite = true,
  slidesPerView = 1,
  gap = 16,
  pauseOnHover = true,
  onChange,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout>();

  const totalSlides = children.length;
  const maxIndex = Math.max(0, totalSlides - slidesPerView);

  const goTo = useCallback((index: number) => {
    let newIndex = index;

    if (infinite) {
      if (index < 0) newIndex = maxIndex;
      else if (index > maxIndex) newIndex = 0;
    } else {
      newIndex = Math.max(0, Math.min(maxIndex, index));
    }

    setCurrentIndex(newIndex);
    onChange?.(newIndex);
  }, [infinite, maxIndex, onChange]);

  const goNext = useCallback(() => goTo(currentIndex + 1), [currentIndex, goTo]);
  const goPrev = useCallback(() => goTo(currentIndex - 1), [currentIndex, goTo]);

  // Auto play
  useEffect(() => {
    if (autoPlay && !isHovered && !isDragging) {
      timerRef.current = setInterval(goNext, autoPlayInterval);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoPlay, autoPlayInterval, isHovered, isDragging, goNext]);

  // Drag handlers
  const handleDragStart = (clientX: number) => {
    setIsDragging(true);
    setDragStart(clientX);
    setDragOffset(0);
  };

  const handleDragMove = (clientX: number) => {
    if (!isDragging) return;
    setDragOffset(clientX - dragStart);
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    const threshold = 50;
    if (dragOffset > threshold) {
      goPrev();
    } else if (dragOffset < -threshold) {
      goNext();
    }
    setDragOffset(0);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };

    if (isHovered) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHovered, goNext, goPrev]);

  const slideWidth = trackRef.current
    ? (trackRef.current.offsetWidth - gap * (slidesPerView - 1)) / slidesPerView
    : 0;

  const translateX = -currentIndex * (slideWidth + gap) + dragOffset;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      width: '100%',
      overflow: 'hidden',
    },
    track: {
      display: 'flex',
      gap,
      transition: isDragging ? 'none' : 'transform 0.4s ease-out',
      transform: `translateX(${translateX}px)`,
      cursor: isDragging ? 'grabbing' : 'grab',
    },
    slide: {
      flexShrink: 0,
      width: `calc((100% - ${gap * (slidesPerView - 1)}px) / ${slidesPerView})`,
    },
    arrow: {
      position: 'absolute',
      top: '50%',
      transform: 'translateY(-50%)',
      width: 44,
      height: 44,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: '50%',
      cursor: 'pointer',
      fontSize: 20,
      color: 'var(--color-text)',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
      transition: 'transform 0.15s, background 0.15s',
      zIndex: 10,
    },
    arrowLeft: {
      left: 16,
    },
    arrowRight: {
      right: 16,
    },
    arrowDisabled: {
      opacity: 0.3,
      cursor: 'not-allowed',
    },
    dots: {
      display: 'flex',
      justifyContent: 'center',
      gap: 8,
      marginTop: 16,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: 'var(--color-border)',
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      transition: 'background 0.2s, transform 0.2s',
    },
    dotActive: {
      background: 'var(--color-accent)',
      transform: 'scale(1.2)',
    },
  };

  const canGoPrev = infinite || currentIndex > 0;
  const canGoNext = infinite || currentIndex < maxIndex;

  return (
    <div
      style={styles.container as any}
      onMouseEnter={() => pauseOnHover && setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        handleDragEnd();
      }}
    >
      <div
        ref={trackRef}
        style={styles.track}
        onMouseDown={(e) => handleDragStart(e.clientX)}
        onMouseMove={(e) => handleDragMove(e.clientX)}
        onMouseUp={handleDragEnd}
        onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
        onTouchMove={(e) => handleDragMove(e.touches[0].clientX)}
        onTouchEnd={handleDragEnd}
      >
        {children.map((child, index) => (
          <div key={index} style={styles.slide}>
            {child}
          </div>
        ))}
      </div>

      {showArrows && (
        <>
          <button
            style={{
              ...styles.arrow,
              ...styles.arrowLeft,
              ...(canGoPrev ? {} : styles.arrowDisabled),
            } as any}
            onClick={goPrev}
            disabled={!canGoPrev}
            onMouseEnter={(e) => {
              if (canGoPrev) {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-50%) scale(1.1)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-50%)';
            }}
          >
            ‹
          </button>
          <button
            style={{
              ...styles.arrow,
              ...styles.arrowRight,
              ...(canGoNext ? {} : styles.arrowDisabled),
            } as any}
            onClick={goNext}
            disabled={!canGoNext}
            onMouseEnter={(e) => {
              if (canGoNext) {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-50%) scale(1.1)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-50%)';
            }}
          >
            ›
          </button>
        </>
      )}

      {showDots && (
        <div style={styles.dots}>
          {Array.from({ length: maxIndex + 1 }).map((_, index) => (
            <button
              key={index}
              style={{
                ...styles.dot,
                ...(currentIndex === index ? styles.dotActive : {}),
              }}
              onClick={() => goTo(index)}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== IMAGE CAROUSEL ====================

export const ImageCarousel: React.FC<ImageCarouselProps> = ({
  images,
  aspectRatio = 16 / 9,
  showThumbnails = true,
  autoPlay = false,
  autoPlayInterval = 5000,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    },
    main: {
      position: 'relative',
      width: '100%',
      paddingBottom: `${(1 / aspectRatio) * 100}%`,
      background: 'var(--color-bg-tertiary)',
      borderRadius: 12,
      overflow: 'hidden',
    },
    image: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      transition: 'opacity 0.3s',
    },
    caption: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: '24px 16px 16px',
      background: 'linear-gradient(transparent, rgba(0, 0, 0, 0.7))',
      color: '#fff',
      fontSize: 14,
    },
    thumbnails: {
      display: 'flex',
      gap: 8,
      overflowX: 'auto',
      padding: '4px 0',
    },
    thumbnail: {
      width: 64,
      height: 64,
      flexShrink: 0,
      borderRadius: 8,
      overflow: 'hidden',
      cursor: 'pointer',
      opacity: 0.6,
      transition: 'opacity 0.2s, transform 0.2s',
      border: '2px solid transparent',
    },
    thumbnailActive: {
      opacity: 1,
      borderColor: 'var(--color-accent)',
    },
    thumbnailImage: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
    counter: {
      position: 'absolute',
      top: 12,
      right: 12,
      padding: '4px 10px',
      background: 'rgba(0, 0, 0, 0.5)',
      borderRadius: 12,
      fontSize: 12,
      color: '#fff',
    },
  };

  return (
    <div style={styles.container as any}>
      <Carousel
        autoPlay={autoPlay}
        autoPlayInterval={autoPlayInterval}
        showDots={!showThumbnails}
        onChange={setCurrentIndex}
      >
        {images.map((image, index) => (
          <div key={index} style={styles.main as any}>
            <img
              src={image.src}
              alt={image.alt || `Image ${index + 1}`}
              style={styles.image as any}
            />
            {image.caption && (
              <div style={styles.caption as any}>{image.caption}</div>
            )}
            <div style={styles.counter as any}>
              {index + 1} / {images.length}
            </div>
          </div>
        ))}
      </Carousel>

      {showThumbnails && (
        <div style={styles.thumbnails}>
          {images.map((image, index) => (
            <div
              key={index}
              style={{
                ...styles.thumbnail,
                ...(currentIndex === index ? styles.thumbnailActive : {}),
              }}
              onClick={() => setCurrentIndex(index)}
            >
              <img
                src={image.src}
                alt={image.alt || `Thumbnail ${index + 1}`}
                style={styles.thumbnailImage}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== TESTIMONIAL CAROUSEL ====================

export const TestimonialCarousel: React.FC<TestimonialCarouselProps> = ({
  testimonials,
  autoPlay = true,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    card: {
      padding: 32,
      background: 'var(--color-bg-secondary)',
      borderRadius: 16,
      textAlign: 'center',
    },
    stars: {
      display: 'flex',
      justifyContent: 'center',
      gap: 4,
      marginBottom: 16,
    },
    star: {
      fontSize: 18,
    },
    content: {
      fontSize: 18,
      lineHeight: 1.6,
      color: 'var(--color-text)',
      fontStyle: 'italic',
      marginBottom: 24,
    },
    author: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: '50%',
      background: 'var(--color-accent)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 20,
      fontWeight: 600,
      color: '#fff',
      overflow: 'hidden',
    },
    avatarImage: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
    name: {
      fontSize: 16,
      fontWeight: 600,
      color: 'var(--color-text)',
    },
    role: {
      fontSize: 14,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <Carousel autoPlay={autoPlay} autoPlayInterval={6000}>
      {testimonials.map((testimonial, index) => (
        <div key={index} style={styles.card as any}>
          {testimonial.rating && (
            <div style={styles.stars}>
              {Array.from({ length: 5 }).map((_, i) => (
                <span
                  key={i}
                  style={{
                    ...styles.star,
                    color: i < testimonial.rating! ? '#f59e0b' : 'var(--color-border)',
                  }}
                >
                  star
                </span>
              ))}
            </div>
          )}

          <p style={styles.content}>&ldquo;{testimonial.content}&rdquo;</p>

          <div style={styles.author as any}>
            <div style={styles.avatar}>
              {testimonial.avatar ? (
                <img
                  src={testimonial.avatar}
                  alt={testimonial.author}
                  style={styles.avatarImage}
                />
              ) : (
                testimonial.author.charAt(0).toUpperCase()
              )}
            </div>
            <span style={styles.name}>{testimonial.author}</span>
            {testimonial.role && (
              <span style={styles.role}>{testimonial.role}</span>
            )}
          </div>
        </div>
      ))}
    </Carousel>
  );
};

// ==================== CARD CAROUSEL ====================

interface CardCarouselProps {
  children: React.ReactNode[];
  cardsPerView?: number;
  gap?: number;
}

export const CardCarousel: React.FC<CardCarouselProps> = ({
  children,
  cardsPerView = 3,
  gap = 24,
}) => {
  return (
    <Carousel
      slidesPerView={cardsPerView}
      gap={gap}
      showDots={false}
      infinite={false}
    >
      {children}
    </Carousel>
  );
};

// ==================== FADE CAROUSEL ====================

interface FadeCarouselProps {
  children: React.ReactNode[];
  autoPlay?: boolean;
  autoPlayInterval?: number;
  showDots?: boolean;
}

export const FadeCarousel: React.FC<FadeCarouselProps> = ({
  children,
  autoPlay = true,
  autoPlayInterval = 5000,
  showDots = true,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!autoPlay) return;

    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % children.length);
    }, autoPlayInterval);

    return () => clearInterval(timer);
  }, [autoPlay, autoPlayInterval, children.length]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      width: '100%',
    },
    slides: {
      position: 'relative',
    },
    slide: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      opacity: 0,
      transition: 'opacity 0.5s ease-in-out',
      pointerEvents: 'none',
    },
    slideActive: {
      position: 'relative',
      opacity: 1,
      pointerEvents: 'auto',
    },
    dots: {
      display: 'flex',
      justifyContent: 'center',
      gap: 8,
      marginTop: 16,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: 'var(--color-border)',
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      transition: 'background 0.2s',
    },
    dotActive: {
      background: 'var(--color-accent)',
    },
  };

  return (
    <div style={styles.container as any}>
      <div style={styles.slides as any}>
        {children.map((child, index) => (
          <div
            key={index}
            style={{
              ...styles.slide,
              ...(currentIndex === index ? styles.slideActive : {}),
            } as any}
          >
            {child}
          </div>
        ))}
      </div>

      {showDots && (
        <div style={styles.dots}>
          {children.map((_, index) => (
            <button
              key={index}
              style={{
                ...styles.dot,
                ...(currentIndex === index ? styles.dotActive : {}),
              }}
              onClick={() => setCurrentIndex(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Carousel;
