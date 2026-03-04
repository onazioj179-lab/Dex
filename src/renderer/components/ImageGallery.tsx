/**
 * DEX Image Gallery Component
 * Image display, lightbox, and gallery features
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

// ==================== TYPES ====================

interface GalleryImage {
  id: string;
  src: string;
  thumbnail?: string;
  alt?: string;
  title?: string;
  description?: string;
  width?: number;
  height?: number;
}

interface ImageGalleryProps {
  images: GalleryImage[];
  columns?: number;
  gap?: number;
  aspectRatio?: 'square' | '16:9' | '4:3' | 'auto';
  onImageClick?: (image: GalleryImage, index: number) => void;
  enableLightbox?: boolean;
}

interface LightboxProps {
  images: GalleryImage[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (index: number) => void;
  showThumbnails?: boolean;
  showInfo?: boolean;
}

interface ImageZoomProps {
  src: string;
  alt?: string;
  zoomLevel?: number;
  enableZoom?: boolean;
}

interface MasonryGalleryProps {
  images: GalleryImage[];
  columns?: number;
  gap?: number;
  onImageClick?: (image: GalleryImage, index: number) => void;
}

interface CarouselProps {
  images: GalleryImage[];
  autoPlay?: boolean;
  interval?: number;
  showIndicators?: boolean;
  showArrows?: boolean;
  aspectRatio?: string;
}

// ==================== IMAGE GALLERY ====================

export const ImageGallery: React.FC<ImageGalleryProps> = ({
  images,
  columns = 3,
  gap = 16,
  aspectRatio = 'square',
  onImageClick,
  enableLightbox = true,
}) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const getAspectRatio = (): string => {
    switch (aspectRatio) {
      case 'square': return '1 / 1';
      case '16:9': return '16 / 9';
      case '4:3': return '4 / 3';
      default: return 'auto';
    }
  };

  const handleImageClick = (image: GalleryImage, index: number) => {
    if (enableLightbox) {
      setLightboxIndex(index);
      setLightboxOpen(true);
    }
    onImageClick?.(image, index);
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap,
    },
    imageWrapper: {
      position: 'relative',
      borderRadius: 8,
      overflow: 'hidden',
      cursor: 'pointer',
      aspectRatio: getAspectRatio(),
    },
    image: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      transition: 'transform 0.3s',
    },
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.4)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      padding: 12,
      opacity: 0,
      transition: 'opacity 0.2s',
    },
    overlayVisible: {
      opacity: 1,
    },
    title: {
      fontSize: 14,
      fontWeight: 600,
      color: '#fff',
      margin: 0,
    },
    description: {
      fontSize: 12,
      color: 'rgba(255, 255, 255, 0.8)',
      margin: '4px 0 0 0',
    },
  };

  return (
    <>
      <div style={styles.container}>
        {images.map((image, index) => (
          <div
            key={image.id}
            style={styles.imageWrapper}
            onClick={() => handleImageClick(image, index)}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <img
              src={image.thumbnail || image.src}
              alt={image.alt || ''}
              style={{
                ...styles.image,
                transform: hoveredIndex === index ? 'scale(1.05)' : 'scale(1)',
              }}
            />
            {(image.title || image.description) && (
              <div
                style={{
                  ...styles.overlay,
                  ...(hoveredIndex === index ? styles.overlayVisible : {}),
                }}
              >
                {image.title && <p style={styles.title}>{image.title}</p>}
                {image.description && (
                  <p style={styles.description}>{image.description}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {enableLightbox && (
        <Lightbox
          images={images}
          currentIndex={lightboxIndex}
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          onNavigate={setLightboxIndex}
          showThumbnails
          showInfo
        />
      )}
    </>
  );
};

// ==================== LIGHTBOX ====================

export const Lightbox: React.FC<LightboxProps> = ({
  images,
  currentIndex,
  isOpen,
  onClose,
  onNavigate,
  showThumbnails = false,
  showInfo = true,
}) => {
  const [index, setIndex] = useState(currentIndex);
  const [loading, setLoading] = useState(true);

  const currentImage = images[index];

  useEffect(() => {
    setIndex(currentIndex);
  }, [currentIndex]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          navigatePrev();
          break;
        case 'ArrowRight':
          navigateNext();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, index]);

  const navigatePrev = () => {
    const newIndex = index > 0 ? index - 1 : images.length - 1;
    setIndex(newIndex);
    onNavigate?.(newIndex);
    setLoading(true);
  };

  const navigateNext = () => {
    const newIndex = index < images.length - 1 ? index + 1 : 0;
    setIndex(newIndex);
    onNavigate?.(newIndex);
    setLoading(true);
  };

  if (!isOpen) return null;

  const styles: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.95)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 9999,
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 20px',
    },
    counter: {
      fontSize: 14,
      color: 'rgba(255, 255, 255, 0.7)',
    },
    closeButton: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 40,
      height: 40,
      background: 'rgba(255, 255, 255, 0.1)',
      border: 'none',
      borderRadius: 8,
      cursor: 'pointer',
      fontSize: 24,
      color: '#fff',
    },
    content: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      padding: '0 60px',
    },
    image: {
      maxWidth: '100%',
      maxHeight: '100%',
      objectFit: 'contain',
      transition: 'opacity 0.2s',
      opacity: loading ? 0.5 : 1,
    },
    navButton: {
      position: 'absolute',
      top: '50%',
      transform: 'translateY(-50%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 48,
      height: 48,
      background: 'rgba(255, 255, 255, 0.1)',
      border: 'none',
      borderRadius: '50%',
      cursor: 'pointer',
      fontSize: 24,
      color: '#fff',
      transition: 'background 0.2s',
    },
    prevButton: {
      left: 20,
    },
    nextButton: {
      right: 20,
    },
    info: {
      padding: 20,
      textAlign: 'center',
    },
    title: {
      fontSize: 16,
      fontWeight: 600,
      color: '#fff',
      margin: 0,
    },
    description: {
      fontSize: 14,
      color: 'rgba(255, 255, 255, 0.7)',
      margin: '8px 0 0 0',
    },
    thumbnails: {
      display: 'flex',
      gap: 8,
      padding: 16,
      overflowX: 'auto',
      justifyContent: 'center',
    },
    thumbnail: {
      width: 60,
      height: 60,
      borderRadius: 4,
      overflow: 'hidden',
      cursor: 'pointer',
      opacity: 0.5,
      transition: 'opacity 0.2s',
      border: '2px solid transparent',
    },
    thumbnailActive: {
      opacity: 1,
      borderColor: '#fff',
    },
    thumbnailImage: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.header}>
        <span style={styles.counter}>
          {index + 1} / {images.length}
        </span>
        <button style={styles.closeButton} onClick={onClose}>
          ×
        </button>
      </div>

      <div style={styles.content}>
        <button
          style={{ ...styles.navButton, ...styles.prevButton }}
          onClick={navigatePrev}
        >
          ‹
        </button>

        <img
          src={currentImage.src}
          alt={currentImage.alt || ''}
          style={styles.image}
          onLoad={() => setLoading(false)}
        />

        <button
          style={{ ...styles.navButton, ...styles.nextButton }}
          onClick={navigateNext}
        >
          ›
        </button>
      </div>

      {showInfo && (currentImage.title || currentImage.description) && (
        <div style={styles.info}>
          {currentImage.title && <h3 style={styles.title}>{currentImage.title}</h3>}
          {currentImage.description && (
            <p style={styles.description}>{currentImage.description}</p>
          )}
        </div>
      )}

      {showThumbnails && (
        <div style={styles.thumbnails}>
          {images.map((img, i) => (
            <div
              key={img.id}
              style={{
                ...styles.thumbnail,
                ...(i === index ? styles.thumbnailActive : {}),
              }}
              onClick={() => {
                setIndex(i);
                onNavigate?.(i);
                setLoading(true);
              }}
            >
              <img
                src={img.thumbnail || img.src}
                alt={img.alt || ''}
                style={styles.thumbnailImage}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== IMAGE ZOOM ====================

export const ImageZoom: React.FC<ImageZoomProps> = ({
  src,
  alt = '',
  zoomLevel = 2,
  enableZoom = true,
}) => {
  const [isZoomed, setIsZoomed] = useState(false);
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current || !isZoomed) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPosition({ x, y });
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      overflow: 'hidden',
      cursor: enableZoom ? (isZoomed ? 'zoom-out' : 'zoom-in') : 'default',
    },
    image: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      transition: isZoomed ? 'none' : 'transform 0.3s',
      transform: isZoomed ? `scale(${zoomLevel})` : 'scale(1)',
      transformOrigin: `${position.x}% ${position.y}%`,
    },
  };

  return (
    <div
      ref={containerRef}
      style={styles.container}
      onClick={() => enableZoom && setIsZoomed(!isZoomed)}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setIsZoomed(false)}
    >
      <img src={src} alt={alt} style={styles.image} />
    </div>
  );
};

// ==================== CAROUSEL ====================

export const Carousel: React.FC<CarouselProps> = ({
  images,
  autoPlay = false,
  interval = 5000,
  showIndicators = true,
  showArrows = true,
  aspectRatio = '16 / 9',
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!autoPlay || isPaused) return;

    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % images.length);
    }, interval);

    return () => clearInterval(timer);
  }, [autoPlay, interval, isPaused, images.length]);

  const goTo = (index: number) => {
    setCurrentIndex(index);
  };

  const goToPrev = () => {
    setCurrentIndex(prev => (prev - 1 + images.length) % images.length);
  };

  const goToNext = () => {
    setCurrentIndex(prev => (prev + 1) % images.length);
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 8,
      aspectRatio,
    },
    track: {
      display: 'flex',
      height: '100%',
      transition: 'transform 0.5s ease',
      transform: `translateX(-${currentIndex * 100}%)`,
    },
    slide: {
      minWidth: '100%',
      height: '100%',
    },
    image: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
    arrow: {
      position: 'absolute',
      top: '50%',
      transform: 'translateY(-50%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 40,
      height: 40,
      background: 'rgba(0, 0, 0, 0.5)',
      border: 'none',
      borderRadius: '50%',
      cursor: 'pointer',
      fontSize: 20,
      color: '#fff',
      transition: 'background 0.2s',
      zIndex: 2,
    },
    arrowLeft: {
      left: 16,
    },
    arrowRight: {
      right: 16,
    },
    indicators: {
      position: 'absolute',
      bottom: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: 8,
      zIndex: 2,
    },
    indicator: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: 'rgba(255, 255, 255, 0.5)',
      border: 'none',
      cursor: 'pointer',
      transition: 'background 0.2s',
      padding: 0,
    },
    indicatorActive: {
      background: '#fff',
    },
  };

  return (
    <div
      style={styles.container}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div style={styles.track}>
        {images.map(image => (
          <div key={image.id} style={styles.slide}>
            <img src={image.src} alt={image.alt || ''} style={styles.image} />
          </div>
        ))}
      </div>

      {showArrows && (
        <>
          <button
            style={{ ...styles.arrow, ...styles.arrowLeft }}
            onClick={goToPrev}
          >
            ‹
          </button>
          <button
            style={{ ...styles.arrow, ...styles.arrowRight }}
            onClick={goToNext}
          >
            ›
          </button>
        </>
      )}

      {showIndicators && (
        <div style={styles.indicators}>
          {images.map((_, index) => (
            <button
              key={index}
              style={{
                ...styles.indicator,
                ...(index === currentIndex ? styles.indicatorActive : {}),
              }}
              onClick={() => goTo(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== MASONRY GALLERY ====================

export const MasonryGallery: React.FC<MasonryGalleryProps> = ({
  images,
  columns = 3,
  gap = 16,
  onImageClick,
}) => {
  const distributeImages = () => {
    const cols: GalleryImage[][] = Array.from({ length: columns }, () => []);
    
    images.forEach((image, index) => {
      cols[index % columns].push(image);
    });

    return cols;
  };

  const columnImages = distributeImages();

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      gap,
    },
    column: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap,
    },
    image: {
      width: '100%',
      borderRadius: 8,
      cursor: onImageClick ? 'pointer' : 'default',
      transition: 'transform 0.2s',
    },
  };

  return (
    <div style={styles.container}>
      {columnImages.map((column, colIndex) => (
        <div key={colIndex} style={styles.column}>
          {column.map((image, imgIndex) => (
            <img
              key={image.id}
              src={image.thumbnail || image.src}
              alt={image.alt || ''}
              style={styles.image}
              onClick={() => onImageClick?.(image, colIndex * columns + imgIndex)}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

export default ImageGallery;
