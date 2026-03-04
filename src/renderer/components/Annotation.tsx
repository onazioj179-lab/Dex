/**
 * DEX Annotations & Markup Components
 * Text and image annotation tools
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';

// ==================== TYPES ====================

interface TextAnnotation {
  id: string;
  start: number;
  end: number;
  type: 'highlight' | 'underline' | 'strikethrough' | 'comment';
  color?: string;
  note?: string;
  author?: string;
  createdAt?: Date;
}

interface ImageAnnotation {
  id: string;
  type: 'rectangle' | 'circle' | 'arrow' | 'text' | 'pin' | 'freehand';
  x: number;
  y: number;
  width?: number;
  height?: number;
  endX?: number;
  endY?: number;
  points?: { x: number; y: number }[];
  text?: string;
  color?: string;
  note?: string;
}

interface TextAnnotatorProps {
  text: string;
  annotations: TextAnnotation[];
  onAnnotationAdd?: (annotation: Omit<TextAnnotation, 'id'>) => void;
  onAnnotationRemove?: (id: string) => void;
  onAnnotationClick?: (annotation: TextAnnotation) => void;
  readOnly?: boolean;
}

interface ImageAnnotatorProps {
  src: string;
  annotations: ImageAnnotation[];
  onAnnotationAdd?: (annotation: Omit<ImageAnnotation, 'id'>) => void;
  onAnnotationUpdate?: (id: string, annotation: Partial<ImageAnnotation>) => void;
  onAnnotationRemove?: (id: string) => void;
  readOnly?: boolean;
  tools?: ImageAnnotation['type'][];
}

// ==================== TEXT ANNOTATOR ====================

export const TextAnnotator: React.FC<TextAnnotatorProps> = ({
  text,
  annotations,
  onAnnotationAdd,
  onAnnotationRemove,
  onAnnotationClick,
  readOnly = false,
}) => {
  const [selectedAnnotationType, setSelectedAnnotationType] = useState<TextAnnotation['type']>('highlight');
  const [selectedColor, setSelectedColor] = useState('#ffeb3b');
  const [activeAnnotation, setActiveAnnotation] = useState<TextAnnotation | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTextSelection = useCallback(() => {
    if (readOnly) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const container = containerRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) return;

    // Calculate text offsets
    const preRange = document.createRange();
    preRange.setStart(container, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const end = start + range.toString().length;

    if (start !== end) {
      onAnnotationAdd?.({
        start,
        end,
        type: selectedAnnotationType,
        color: selectedColor,
        createdAt: new Date(),
      });
      selection.removeAllRanges();
    }
  }, [selectedAnnotationType, selectedColor, onAnnotationAdd, readOnly]);

  const renderAnnotatedText = () => {
    if (annotations.length === 0) {
      return text;
    }

    // Sort annotations by start position
    const sorted = [...annotations].sort((a, b) => a.start - b.start);
    const elements: React.ReactNode[] = [];
    let lastEnd = 0;

    sorted.forEach((annotation, index) => {
      // Add text before annotation
      if (annotation.start > lastEnd) {
        elements.push(
          <span key={`text-${index}`}>{text.slice(lastEnd, annotation.start)}</span>
        );
      }

      // Add annotated text
      const annotatedText = text.slice(annotation.start, annotation.end);
      const style = getAnnotationStyle(annotation);

      elements.push(
        <span
          key={annotation.id}
          style={style}
          onClick={() => {
            setActiveAnnotation(annotation);
            onAnnotationClick?.(annotation);
          }}
          title={annotation.note}
        >
          {annotatedText}
        </span>
      );

      lastEnd = annotation.end;
    });

    // Add remaining text
    if (lastEnd < text.length) {
      elements.push(<span key="text-end">{text.slice(lastEnd)}</span>);
    }

    return elements;
  };

  const getAnnotationStyle = (annotation: TextAnnotation): React.CSSProperties => {
    switch (annotation.type) {
      case 'highlight':
        return {
          backgroundColor: annotation.color || '#ffeb3b',
          cursor: 'pointer',
        };
      case 'underline':
        return {
          textDecoration: 'underline',
          textDecorationColor: annotation.color || '#2196f3',
          cursor: 'pointer',
        };
      case 'strikethrough':
        return {
          textDecoration: 'line-through',
          textDecorationColor: annotation.color || '#f44336',
          cursor: 'pointer',
        };
      case 'comment':
        return {
          backgroundColor: 'rgba(255, 193, 7, 0.2)',
          borderBottom: `2px solid ${annotation.color || '#ffc107'}`,
          cursor: 'pointer',
        };
      default:
        return {};
    }
  };

  const colors = ['#ffeb3b', '#4caf50', '#2196f3', '#e91e63', '#ff9800'];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    },
    toolbar: {
      display: 'flex',
      gap: 8,
      padding: 12,
      background: 'var(--color-bg-secondary)',
      borderRadius: 8,
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    toolGroup: {
      display: 'flex',
      gap: 4,
    },
    toolButton: {
      padding: '6px 12px',
      border: 'none',
      borderRadius: 4,
      cursor: 'pointer',
      fontSize: 13,
    },
    colorButton: {
      width: 24,
      height: 24,
      borderRadius: '50%',
      border: '2px solid transparent',
      cursor: 'pointer',
    },
    textArea: {
      padding: 16,
      background: 'var(--color-bg)',
      borderRadius: 8,
      lineHeight: 1.8,
      fontSize: 15,
      color: 'var(--color-text)',
      whiteSpace: 'pre-wrap',
    },
    annotationPopup: {
      position: 'fixed',
      background: 'var(--color-bg)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      padding: 12,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: 1000,
      maxWidth: 300,
    },
  };

  return (
    <div style={styles.container as any}>
      {!readOnly && (
        <div style={styles.toolbar}>
          <div style={styles.toolGroup}>
            {(['highlight', 'underline', 'strikethrough', 'comment'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setSelectedAnnotationType(type)}
                style={{
                  ...styles.toolButton,
                  background: selectedAnnotationType === type
                    ? 'var(--color-accent)'
                    : 'var(--color-bg-tertiary)',
                  color: selectedAnnotationType === type
                    ? 'white'
                    : 'var(--color-text)',
                }}
              >
                {type === 'highlight' && 'edit️'}
                {type === 'underline' && '＿'}
                {type === 'strikethrough' && '̶S̶'}
                {type === 'comment' && 'message-circle'}
              </button>
            ))}
          </div>
          <div style={{ width: 1, height: 24, background: 'var(--color-border)' }} />
          <div style={styles.toolGroup}>
            {colors.map((color) => (
              <button
                key={color}
                onClick={() => setSelectedColor(color)}
                style={{
                  ...styles.colorButton,
                  background: color,
                  borderColor: selectedColor === color ? 'var(--color-text)' : 'transparent',
                }}
              />
            ))}
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        style={styles.textArea}
        onMouseUp={handleTextSelection}
      >
        {renderAnnotatedText()}
      </div>

      {activeAnnotation && activeAnnotation.note && (
        <div style={styles.annotationPopup as any}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {activeAnnotation.author || 'Note'}
            </span>
            <button
              onClick={() => setActiveAnnotation(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              ×
            </button>
          </div>
          <p style={{ margin: 0, fontSize: 13 }}>{activeAnnotation.note}</p>
          {!readOnly && onAnnotationRemove && (
            <button
              onClick={() => {
                onAnnotationRemove(activeAnnotation.id);
                setActiveAnnotation(null);
              }}
              style={{
                marginTop: 8,
                padding: '4px 8px',
                border: 'none',
                borderRadius: 4,
                background: 'var(--color-error)',
                color: 'white',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ==================== IMAGE ANNOTATOR ====================

export const ImageAnnotator: React.FC<ImageAnnotatorProps> = ({
  src,
  annotations,
  onAnnotationAdd,
  onAnnotationUpdate,
  onAnnotationRemove,
  readOnly = false,
  tools = ['rectangle', 'circle', 'arrow', 'text', 'pin', 'freehand'],
}) => {
  const [activeTool, setActiveTool] = useState<ImageAnnotation['type']>('rectangle');
  const [selectedColor, setSelectedColor] = useState('#ff0000');
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentAnnotation, setCurrentAnnotation] = useState<Partial<ImageAnnotation> | null>(null);
  const [selectedAnnotation, setSelectedAnnotation] = useState<ImageAnnotation | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    drawAnnotations();
  }, [annotations, currentAnnotation]);

  const getMousePosition = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };

    const rect = container.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (readOnly) return;

    const pos = getMousePosition(e);
    setIsDrawing(true);

    if (activeTool === 'freehand') {
      setCurrentAnnotation({
        type: 'freehand',
        x: pos.x,
        y: pos.y,
        points: [{ x: pos.x, y: pos.y }],
        color: selectedColor,
      });
    } else {
      setCurrentAnnotation({
        type: activeTool,
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        color: selectedColor,
      });
    }
  }, [activeTool, selectedColor, getMousePosition, readOnly]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing || !currentAnnotation) return;

    const pos = getMousePosition(e);

    if (activeTool === 'freehand') {
      setCurrentAnnotation((prev) => ({
        ...prev,
        points: [...(prev?.points || []), { x: pos.x, y: pos.y }],
      }));
    } else if (activeTool === 'arrow') {
      setCurrentAnnotation((prev) => ({
        ...prev,
        endX: pos.x,
        endY: pos.y,
      }));
    } else {
      setCurrentAnnotation((prev) => ({
        ...prev,
        width: pos.x - (prev?.x || 0),
        height: pos.y - (prev?.y || 0),
      }));
    }
  }, [isDrawing, currentAnnotation, activeTool, getMousePosition]);

  const handleMouseUp = useCallback(() => {
    if (!isDrawing || !currentAnnotation) return;

    setIsDrawing(false);

    // Check if annotation is valid (has some size)
    if (activeTool === 'freehand') {
      if (currentAnnotation.points && currentAnnotation.points.length > 2) {
        onAnnotationAdd?.(currentAnnotation as Omit<ImageAnnotation, 'id'>);
      }
    } else if (activeTool === 'pin' || activeTool === 'text') {
      onAnnotationAdd?.(currentAnnotation as Omit<ImageAnnotation, 'id'>);
    } else {
      const width = Math.abs(currentAnnotation.width || 0);
      const height = Math.abs(currentAnnotation.height || 0);
      if (width > 5 || height > 5) {
        onAnnotationAdd?.(currentAnnotation as Omit<ImageAnnotation, 'id'>);
      }
    }

    setCurrentAnnotation(null);
  }, [isDrawing, currentAnnotation, activeTool, onAnnotationAdd]);

  const drawAnnotations = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const allAnnotations = currentAnnotation
      ? [...annotations, currentAnnotation as ImageAnnotation]
      : annotations;

    allAnnotations.forEach((annotation) => {
      ctx.strokeStyle = annotation.color || '#ff0000';
      ctx.fillStyle = annotation.color || '#ff0000';
      ctx.lineWidth = 2;

      switch (annotation.type) {
        case 'rectangle':
          ctx.strokeRect(
            annotation.x,
            annotation.y,
            annotation.width || 0,
            annotation.height || 0
          );
          break;

        case 'circle':
          const radiusX = (annotation.width || 0) / 2;
          const radiusY = (annotation.height || 0) / 2;
          ctx.beginPath();
          ctx.ellipse(
            annotation.x + radiusX,
            annotation.y + radiusY,
            Math.abs(radiusX),
            Math.abs(radiusY),
            0,
            0,
            2 * Math.PI
          );
          ctx.stroke();
          break;

        case 'arrow':
          const startX = annotation.x;
          const startY = annotation.y;
          const endX = annotation.endX || annotation.x;
          const endY = annotation.endY || annotation.y;

          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();

          // Draw arrowhead
          const angle = Math.atan2(endY - startY, endX - startX);
          const headLength = 15;
          ctx.beginPath();
          ctx.moveTo(endX, endY);
          ctx.lineTo(
            endX - headLength * Math.cos(angle - Math.PI / 6),
            endY - headLength * Math.sin(angle - Math.PI / 6)
          );
          ctx.moveTo(endX, endY);
          ctx.lineTo(
            endX - headLength * Math.cos(angle + Math.PI / 6),
            endY - headLength * Math.sin(angle + Math.PI / 6)
          );
          ctx.stroke();
          break;

        case 'pin':
          ctx.beginPath();
          ctx.arc(annotation.x, annotation.y, 10, 0, 2 * Math.PI);
          ctx.fill();
          ctx.fillStyle = 'white';
          ctx.beginPath();
          ctx.arc(annotation.x, annotation.y, 5, 0, 2 * Math.PI);
          ctx.fill();
          break;

        case 'text':
          ctx.font = '14px sans-serif';
          ctx.fillText(annotation.text || 'Text', annotation.x, annotation.y);
          break;

        case 'freehand':
          if (annotation.points && annotation.points.length > 0) {
            ctx.beginPath();
            ctx.moveTo(annotation.points[0].x, annotation.points[0].y);
            annotation.points.forEach((point) => {
              ctx.lineTo(point.x, point.y);
            });
            ctx.stroke();
          }
          break;
      }
    });
  }, [annotations, currentAnnotation]);

  const handleImageLoad = useCallback(() => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    drawAnnotations();
  }, [drawAnnotations]);

  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    },
    toolbar: {
      display: 'flex',
      gap: 8,
      padding: 12,
      background: 'var(--color-bg-secondary)',
      borderRadius: 8,
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    toolButton: {
      padding: '8px 12px',
      border: 'none',
      borderRadius: 4,
      cursor: 'pointer',
      fontSize: 14,
    },
    colorButton: {
      width: 24,
      height: 24,
      borderRadius: '50%',
      border: '2px solid transparent',
      cursor: 'pointer',
    },
    imageContainer: {
      position: 'relative',
      display: 'inline-block',
    },
    image: {
      display: 'block',
      maxWidth: '100%',
    },
    canvas: {
      position: 'absolute',
      top: 0,
      left: 0,
      cursor: 'crosshair',
    },
  };

  const toolIcons: Record<ImageAnnotation['type'], string> = {
    rectangle: '⬜',
    circle: '⭕',
    arrow: 'arrow-right',
    text: 'T',
    pin: 'map-pin',
    freehand: 'edit',
  };

  return (
    <div style={styles.container as any}>
      {!readOnly && (
        <div style={styles.toolbar}>
          <div style={{ display: 'flex', gap: 4 }}>
            {tools.map((tool) => (
              <button
                key={tool}
                onClick={() => setActiveTool(tool)}
                style={{
                  ...styles.toolButton,
                  background: activeTool === tool
                    ? 'var(--color-accent)'
                    : 'var(--color-bg-tertiary)',
                  color: activeTool === tool
                    ? 'white'
                    : 'var(--color-text)',
                }}
                title={tool}
              >
                {toolIcons[tool]}
              </button>
            ))}
          </div>
          <div style={{ width: 1, height: 24, background: 'var(--color-border)' }} />
          <div style={{ display: 'flex', gap: 4 }}>
            {colors.map((color) => (
              <button
                key={color}
                onClick={() => setSelectedColor(color)}
                style={{
                  ...styles.colorButton,
                  background: color,
                  borderColor: selectedColor === color ? 'var(--color-text)' : 'transparent',
                }}
              />
            ))}
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        style={styles.imageContainer as any}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          ref={imageRef}
          src={src}
          alt=""
          style={styles.image}
          onLoad={handleImageLoad}
        />
        <canvas
          ref={canvasRef}
          style={{
            ...styles.canvas as any,
            width: '100%',
            height: '100%',
          }}
        />
      </div>
    </div>
  );
};

// ==================== ANNOTATION SIDEBAR ====================

interface AnnotationSidebarProps {
  annotations: (TextAnnotation | ImageAnnotation)[];
  onSelect?: (annotation: TextAnnotation | ImageAnnotation) => void;
  onDelete?: (id: string) => void;
}

export const AnnotationSidebar: React.FC<AnnotationSidebarProps> = ({
  annotations,
  onSelect,
  onDelete,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: 'var(--color-bg-secondary)',
      borderRadius: 8,
      padding: 16,
      width: 280,
    },
    header: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-text)',
      marginBottom: 16,
    },
    list: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    item: {
      padding: 12,
      background: 'var(--color-bg)',
      borderRadius: 6,
      cursor: 'pointer',
      transition: 'background 0.15s ease',
    },
    itemHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    itemType: {
      fontSize: 12,
      fontWeight: 500,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
    },
    itemNote: {
      fontSize: 13,
      color: 'var(--color-text)',
      marginTop: 8,
      lineHeight: 1.4,
    },
    deleteBtn: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      padding: 4,
    },
  };

  if (annotations.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>Annotations</div>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          No annotations yet
        </p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>Annotations ({annotations.length})</div>
      <div style={styles.list as any}>
        {annotations.map((annotation) => (
          <div
            key={annotation.id}
            style={styles.item}
            onClick={() => onSelect?.(annotation)}
          >
            <div style={styles.itemHeader}>
              <span style={styles.itemType}>{annotation.type}</span>
              {onDelete && (
                <button
                  style={styles.deleteBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(annotation.id);
                  }}
                >
                  trash
                </button>
              )}
            </div>
            {annotation.note && (
              <div style={styles.itemNote}>{annotation.note}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TextAnnotator;
