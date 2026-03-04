/**
 * DEX Rating Component
 * Star rating and feedback
 */

import React, { useState, useCallback } from 'react';

// ==================== TYPES ====================

interface RatingProps {
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  readOnly?: boolean;
  allowHalf?: boolean;
  icon?: 'star' | 'heart' | 'circle' | 'custom';
  customIcon?: React.ReactNode;
  customEmptyIcon?: React.ReactNode;
  showValue?: boolean;
  labels?: string[];
}

interface FeedbackProps {
  onSubmit?: (feedback: {
    rating: number;
    comment: string;
    category?: string;
  }) => void;
  categories?: string[];
  title?: string;
  placeholder?: string;
  submitText?: string;
  showRating?: boolean;
}

interface EmojiRatingProps {
  value?: number;
  onChange?: (value: number) => void;
  options?: { emoji: string; label: string; value: number }[];
  disabled?: boolean;
  showLabels?: boolean;
}

interface ThumbRatingProps {
  value?: 'up' | 'down' | null;
  onChange?: (value: 'up' | 'down' | null) => void;
  disabled?: boolean;
  showCounts?: boolean;
  upCount?: number;
  downCount?: number;
}

// ==================== RATING ====================

export const Rating: React.FC<RatingProps> = ({
  value: controlledValue,
  defaultValue = 0,
  onChange,
  max = 5,
  size = 'md',
  disabled = false,
  readOnly = false,
  allowHalf = false,
  icon = 'star',
  customIcon,
  customEmptyIcon,
  showValue = false,
  labels,
}) => {
  const [value, setValue] = useState(defaultValue);
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  const currentValue = controlledValue !== undefined ? controlledValue : value;
  const displayValue = hoverValue !== null ? hoverValue : currentValue;

  const handleClick = (rating: number) => {
    if (disabled || readOnly) return;
    setValue(rating);
    onChange?.(rating);
  };

  const handleMouseMove = (e: React.MouseEvent, index: number) => {
    if (disabled || readOnly) return;

    if (allowHalf) {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const isHalf = e.clientX - rect.left < rect.width / 2;
      setHoverValue(index + (isHalf ? 0.5 : 1));
    } else {
      setHoverValue(index + 1);
    }
  };

  const handleMouseLeave = () => {
    setHoverValue(null);
  };

  const sizes = {
    sm: 16,
    md: 24,
    lg: 32,
  };

  const iconSize = sizes[size];

  const getIcon = (filled: boolean, half: boolean = false) => {
    if (customIcon && filled) return customIcon;
    if (customEmptyIcon && !filled) return customEmptyIcon;

    const iconMap = {
      star: filled ? 'star' : 'star',
      heart: filled ? 'heart' : 'heart',
      circle: filled ? '●' : '○',
      custom: filled ? '●' : '○',
    };

    if (half) {
      return icon === 'star' ? '⯪' : iconMap[icon];
    }

    return iconMap[icon];
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
    },
    stars: {
      display: 'flex',
      gap: 2,
    },
    star: {
      fontSize: iconSize,
      cursor: disabled || readOnly ? 'default' : 'pointer',
      userSelect: 'none',
      transition: 'transform 0.15s',
    },
    starFilled: {
      color: '#fbbf24',
    },
    starEmpty: {
      color: 'var(--color-text-muted)',
    },
    value: {
      fontSize: size === 'sm' ? 12 : size === 'md' ? 14 : 16,
      fontWeight: 600,
      color: 'var(--color-text)',
    },
    label: {
      fontSize: size === 'sm' ? 11 : size === 'md' ? 13 : 15,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.stars} onMouseLeave={handleMouseLeave}>
        {Array.from({ length: max }).map((_, index) => {
          const starValue = index + 1;
          const isFilled = displayValue >= starValue;
          const isHalf = allowHalf && displayValue === index + 0.5;

          return (
            <span
              key={index}
              style={{
                ...styles.star,
                ...(isFilled || isHalf ? styles.starFilled : styles.starEmpty),
              }}
              onClick={() => handleClick(starValue)}
              onMouseMove={(e) => handleMouseMove(e, index)}
            >
              {getIcon(isFilled, isHalf)}
            </span>
          );
        })}
      </div>

      {showValue && (
        <span style={styles.value}>{currentValue.toFixed(allowHalf ? 1 : 0)}</span>
      )}

      {labels && labels[Math.floor(displayValue) - 1] && (
        <span style={styles.label}>{labels[Math.floor(displayValue) - 1]}</span>
      )}
    </div>
  );
};

// ==================== FEEDBACK ====================

export const Feedback: React.FC<FeedbackProps> = ({
  onSubmit,
  categories = [],
  title = 'How was your experience?',
  placeholder = 'Tell us more about your experience...',
  submitText = 'Submit Feedback',
  showRating = true,
}) => {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [category, setCategory] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.({ rating, comment, category: category || undefined });
    setSubmitted(true);
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      padding: 24,
      background: 'var(--color-bg-secondary)',
      borderRadius: 12,
      maxWidth: 400,
    },
    title: {
      fontSize: 18,
      fontWeight: 600,
      color: 'var(--color-text)',
      marginBottom: 16,
      textAlign: 'center',
    },
    form: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    },
    ratingWrapper: {
      display: 'flex',
      justifyContent: 'center',
      marginBottom: 8,
    },
    categories: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
    },
    categoryButton: {
      padding: '6px 12px',
      background: 'var(--color-bg-tertiary)',
      border: '1px solid var(--color-border)',
      borderRadius: 16,
      fontSize: 13,
      color: 'var(--color-text)',
      cursor: 'pointer',
      transition: 'all 0.15s',
    },
    categoryButtonActive: {
      background: 'var(--color-accent)',
      borderColor: 'var(--color-accent)',
      color: '#fff',
    },
    textarea: {
      width: '100%',
      minHeight: 100,
      padding: 12,
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      background: 'var(--color-bg-tertiary)',
      fontSize: 14,
      color: 'var(--color-text)',
      resize: 'vertical',
      outline: 'none',
    },
    submitButton: {
      padding: '12px 24px',
      background: rating > 0 ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
      color: rating > 0 ? '#fff' : 'var(--color-text-muted)',
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 500,
      cursor: rating > 0 ? 'pointer' : 'not-allowed',
    },
    success: {
      textAlign: 'center',
      padding: 24,
    },
    successIcon: {
      fontSize: 48,
      marginBottom: 16,
    },
    successTitle: {
      fontSize: 18,
      fontWeight: 600,
      color: 'var(--color-text)',
      marginBottom: 8,
    },
    successMessage: {
      fontSize: 14,
      color: 'var(--color-text-muted)',
    },
  };

  if (submitted) {
    return (
      <div style={styles.container}>
        <div style={styles.success as any}>
          <div style={styles.successIcon}>check-circle</div>
          <div style={styles.successTitle}>Thank you!</div>
          <div style={styles.successMessage}>
            Your feedback helps us improve.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.title as any}>{title}</div>

      <form style={styles.form as any} onSubmit={handleSubmit}>
        {showRating && (
          <div style={styles.ratingWrapper}>
            <Rating
              value={rating}
              onChange={setRating}
              size="lg"
              labels={['Poor', 'Fair', 'Good', 'Very Good', 'Excellent']}
              showValue
            />
          </div>
        )}

        {categories.length > 0 && (
          <div style={styles.categories}>
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                style={{
                  ...styles.categoryButton,
                  ...(category === cat ? styles.categoryButtonActive : {}),
                }}
                onClick={() => setCategory(cat === category ? '' : cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        <textarea
          style={styles.textarea}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={placeholder}
        />

        <button type="submit" style={styles.submitButton} disabled={rating === 0}>
          {submitText}
        </button>
      </form>
    </div>
  );
};

// ==================== EMOJI RATING ====================

export const EmojiRating: React.FC<EmojiRatingProps> = ({
  value: controlledValue,
  onChange,
  options = [
    { emoji: '', label: 'Terrible', value: 1 },
    { emoji: '', label: 'Bad', value: 2 },
    { emoji: '', label: 'Okay', value: 3 },
    { emoji: '', label: 'Good', value: 4 },
    { emoji: '', label: 'Amazing', value: 5 },
  ],
  disabled = false,
  showLabels = true,
}) => {
  const [value, setValue] = useState<number | null>(null);

  const currentValue = controlledValue !== undefined ? controlledValue : value;

  const handleSelect = (v: number) => {
    if (disabled) return;
    setValue(v);
    onChange?.(v);
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      gap: 8,
    },
    option: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      padding: 12,
      background: 'var(--color-bg-secondary)',
      border: '2px solid transparent',
      borderRadius: 12,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'all 0.2s',
    },
    optionSelected: {
      borderColor: 'var(--color-accent)',
      background: 'rgba(var(--color-accent-rgb), 0.1)',
    },
    emoji: {
      fontSize: 32,
      transition: 'transform 0.2s',
    },
    emojiSelected: {
      transform: 'scale(1.2)',
    },
    label: {
      fontSize: 11,
      color: 'var(--color-text-muted)',
      textAlign: 'center',
    },
    labelSelected: {
      color: 'var(--color-accent)',
      fontWeight: 500,
    },
  };

  return (
    <div style={styles.container}>
      {options.map(option => {
        const isSelected = currentValue === option.value;

        return (
          <div
            key={option.value}
            style={{
              ...styles.option,
              ...(isSelected ? styles.optionSelected : {}),
            } as any}
            onClick={() => handleSelect(option.value)}
          >
            <span
              style={{
                ...styles.emoji,
                ...(isSelected ? styles.emojiSelected : {}),
              }}
            >
              {option.emoji}
            </span>
            {showLabels && (
              <span
                style={{
                  ...styles.label,
                  ...(isSelected ? styles.labelSelected : {}),
                } as any}
              >
                {option.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ==================== THUMB RATING ====================

export const ThumbRating: React.FC<ThumbRatingProps> = ({
  value: controlledValue,
  onChange,
  disabled = false,
  showCounts = false,
  upCount = 0,
  downCount = 0,
}) => {
  const [value, setValue] = useState<'up' | 'down' | null>(null);

  const currentValue = controlledValue !== undefined ? controlledValue : value;

  const handleClick = (v: 'up' | 'down') => {
    if (disabled) return;
    const newValue = currentValue === v ? null : v;
    setValue(newValue);
    onChange?.(newValue);
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      gap: 12,
    },
    button: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '8px 16px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 20,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'all 0.2s',
    },
    buttonUp: {
      background: currentValue === 'up' ? 'rgba(34, 197, 94, 0.1)' : undefined,
      borderColor: currentValue === 'up' ? '#22c55e' : undefined,
      color: currentValue === 'up' ? '#22c55e' : 'var(--color-text)',
    },
    buttonDown: {
      background: currentValue === 'down' ? 'rgba(239, 68, 68, 0.1)' : undefined,
      borderColor: currentValue === 'down' ? '#ef4444' : undefined,
      color: currentValue === 'down' ? '#ef4444' : 'var(--color-text)',
    },
    icon: {
      fontSize: 18,
    },
    count: {
      fontSize: 13,
      fontWeight: 500,
    },
  };

  return (
    <div style={styles.container}>
      <button
        style={{ ...styles.button, ...styles.buttonUp }}
        onClick={() => handleClick('up')}
        disabled={disabled}
      >
        <span style={styles.icon}>thumbs-up</span>
        {showCounts && <span style={styles.count}>{upCount}</span>}
      </button>

      <button
        style={{ ...styles.button, ...styles.buttonDown }}
        onClick={() => handleClick('down')}
        disabled={disabled}
      >
        <span style={styles.icon}>thumbs-down</span>
        {showCounts && <span style={styles.count}>{downCount}</span>}
      </button>
    </div>
  );
};

// ==================== NPS RATING ====================

interface NPSRatingProps {
  value?: number;
  onChange?: (value: number) => void;
  disabled?: boolean;
  question?: string;
}

export const NPSRating: React.FC<NPSRatingProps> = ({
  value: controlledValue,
  onChange,
  disabled = false,
  question = 'How likely are you to recommend us?',
}) => {
  const [value, setValue] = useState<number | null>(null);

  const currentValue = controlledValue !== undefined ? controlledValue : value;

  const handleSelect = (v: number) => {
    if (disabled) return;
    setValue(v);
    onChange?.(v);
  };

  const getColor = (v: number): string => {
    if (v <= 6) return '#ef4444'; // Detractor
    if (v <= 8) return '#f59e0b'; // Passive
    return '#22c55e'; // Promoter
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    },
    question: {
      fontSize: 14,
      color: 'var(--color-text)',
      textAlign: 'center',
    },
    scale: {
      display: 'flex',
      gap: 4,
    },
    number: {
      flex: 1,
      padding: '10px 0',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'all 0.15s',
      textAlign: 'center',
    },
    labels: {
      display: 'flex',
      justifyContent: 'space-between',
    },
    label: {
      fontSize: 11,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.container as any}>
      <div style={styles.question as any}>{question}</div>

      <div style={styles.scale}>
        {Array.from({ length: 11 }).map((_, i) => (
          <button
            key={i}
            style={{
              ...styles.number,
              ...(currentValue === i
                ? {
                    background: getColor(i),
                    borderColor: getColor(i),
                    color: '#fff',
                  }
                : {}),
            } as any}
            onClick={() => handleSelect(i)}
            disabled={disabled}
          >
            {i}
          </button>
        ))}
      </div>

      <div style={styles.labels}>
        <span style={styles.label}>Not at all likely</span>
        <span style={styles.label}>Extremely likely</span>
      </div>
    </div>
  );
};

export default Rating;
