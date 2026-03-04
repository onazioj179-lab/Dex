/**
 * DEX Link Components
 * Navigation and external links
 */

import React, { useState } from 'react';
import { YoutubeIcon } from '../utils/icons';

// ==================== TYPES ====================

interface LinkProps {
  href: string;
  children: React.ReactNode;
  external?: boolean;
  variant?: 'default' | 'underline' | 'subtle' | 'button';
  color?: string;
  onClick?: (e: React.MouseEvent) => void;
}

interface NavLinkProps extends LinkProps {
  isActive?: boolean;
  icon?: React.ReactNode;
}

interface BreadcrumbLinkProps {
  items: Array<{
    label: string;
    href?: string;
    icon?: React.ReactNode;
  }>;
  separator?: React.ReactNode;
  maxItems?: number;
}

interface SocialLinkProps {
  platform: 'twitter' | 'facebook' | 'instagram' | 'linkedin' | 'github' | 'youtube' | 'discord';
  href: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'icon' | 'button' | 'text';
}

interface FooterLinkGroupProps {
  title: string;
  links: Array<{
    label: string;
    href: string;
    badge?: string;
  }>;
}

// ==================== LINK ====================

export const Link: React.FC<LinkProps> = ({
  href,
  children,
  external = false,
  variant = 'default',
  color = 'var(--color-accent)',
  onClick,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'underline':
        return {
          color,
          textDecoration: 'underline',
          textUnderlineOffset: 2,
        };
      case 'subtle':
        return {
          color: 'var(--color-text-muted)',
          textDecoration: 'none',
        };
      case 'button':
        return {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 16px',
          background: isHovered ? color : 'transparent',
          color: isHovered ? '#fff' : color,
          border: `1px solid ${color}`,
          borderRadius: 8,
          textDecoration: 'none',
          transition: 'all 0.15s',
        };
      default:
        return {
          color: isHovered ? color : 'var(--color-text)',
          textDecoration: isHovered ? 'underline' : 'none',
        };
    }
  };

  const styles: React.CSSProperties = {
    cursor: 'pointer',
    transition: 'color 0.15s, text-decoration 0.15s',
    ...getVariantStyles(),
  };

  const externalProps = external
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {};

  return (
    <a
      href={href}
      style={styles}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...externalProps}
    >
      {children}
      {external && variant !== 'button' && (
        <span style={{ marginLeft: 4, fontSize: '0.8em' }}>↗</span>
      )}
    </a>
  );
};

// ==================== NAV LINK ====================

export const NavLink: React.FC<NavLinkProps> = ({
  href,
  children,
  isActive = false,
  icon,
  onClick,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const styles: Record<string, React.CSSProperties> = {
    link: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      background: isActive
        ? 'var(--color-accent-light, rgba(59, 130, 246, 0.1))'
        : isHovered
          ? 'var(--color-bg-tertiary)'
          : 'transparent',
      color: isActive ? 'var(--color-accent)' : 'var(--color-text)',
      textDecoration: 'none',
      borderRadius: 8,
      fontWeight: isActive ? 500 : 400,
      transition: 'all 0.15s',
      cursor: 'pointer',
    },
    icon: {
      fontSize: 18,
      opacity: isActive ? 1 : 0.7,
    },
    text: {
      fontSize: 14,
    },
    indicator: {
      width: 3,
      height: 20,
      background: 'var(--color-accent)',
      borderRadius: 2,
      marginLeft: 'auto',
    },
  };

  return (
    <a
      href={href}
      style={styles.link}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {icon && <span style={styles.icon}>{icon}</span>}
      <span style={styles.text}>{children}</span>
      {isActive && <div style={styles.indicator} />}
    </a>
  );
};

// ==================== BREADCRUMB LINK ====================

export const BreadcrumbLink: React.FC<BreadcrumbLinkProps> = ({
  items,
  separator = '/',
  maxItems,
}) => {
  const displayItems = maxItems && items.length > maxItems
    ? [
      items[0],
      { label: '...', href: undefined },
      ...items.slice(-(maxItems - 2)),
    ]
    : items;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    },
    link: {
      color: 'var(--color-text-muted)',
      textDecoration: 'none',
      fontSize: 14,
      transition: 'color 0.15s',
    },
    current: {
      color: 'var(--color-text)',
      fontWeight: 500,
      fontSize: 14,
    },
    separator: {
      color: 'var(--color-text-muted)',
      fontSize: 12,
      opacity: 0.6,
    },
    icon: {
      fontSize: 14,
    },
  };

  return (
    <nav style={styles.container as any}>
      {displayItems.map((item, index) => {
        const isLast = index === displayItems.length - 1;

        return (
          <React.Fragment key={index}>
            <span style={styles.item}>
              {item.icon && <span style={styles.icon}>{item.icon}</span>}
              {item.href && !isLast ? (
                <a
                  href={item.href}
                  style={styles.link}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--color-text)';
                    (e.currentTarget as HTMLElement).style.textDecoration = 'underline';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)';
                    (e.currentTarget as HTMLElement).style.textDecoration = 'none';
                  }}
                >
                  {item.label}
                </a>
              ) : (
                <span style={isLast ? styles.current : styles.link}>
                  {item.label}
                </span>
              )}
            </span>

            {!isLast && (
              <span style={styles.separator}>{separator}</span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

// ==================== SOCIAL LINK ====================

export const SocialLink: React.FC<SocialLinkProps> = ({
  platform,
  href,
  size = 'md',
  variant = 'icon',
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const platforms = {
    twitter: { icon: '𝕏', label: 'Twitter', color: '#1DA1F2' },
    facebook: { icon: 'f', label: 'Facebook', color: '#4267B2' },
    instagram: { icon: 'camera', label: 'Instagram', color: '#E4405F' },
    linkedin: { icon: 'in', label: 'LinkedIn', color: '#0A66C2' },
    github: { icon: 'github', label: 'GitHub', color: '#333' },
    youtube: { icon: <YoutubeIcon size={14} />, label: 'YouTube', color: '#FF0000' },
    discord: { icon: 'message-circle', label: 'Discord', color: '#5865F2' },
  };

  const sizes = {
    sm: { button: 32, icon: 14, text: 12 },
    md: { button: 40, icon: 18, text: 14 },
    lg: { button: 48, icon: 22, text: 16 },
  };

  const p = platforms[platform];
  const s = sizes[size];

  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'button':
        return {
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: `${s.button / 4}px ${s.button / 2}px`,
          background: isHovered ? p.color : 'var(--color-bg-secondary)',
          color: isHovered ? '#fff' : 'var(--color-text)',
          border: `1px solid ${isHovered ? p.color : 'var(--color-border)'}`,
          borderRadius: 8,
        };
      case 'text':
        return {
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: isHovered ? p.color : 'var(--color-text-muted)',
        };
      default:
        return {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: s.button,
          height: s.button,
          background: isHovered ? p.color : 'var(--color-bg-secondary)',
          color: isHovered ? '#fff' : 'var(--color-text)',
          border: `1px solid ${isHovered ? p.color : 'var(--color-border)'}`,
          borderRadius: '50%',
        };
    }
  };

  const styles: React.CSSProperties = {
    textDecoration: 'none',
    transition: 'all 0.15s',
    cursor: 'pointer',
    ...getVariantStyles(),
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={styles}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span style={{ fontSize: s.icon }}>{p.icon}</span>
      {variant !== 'icon' && (
        <span style={{ fontSize: s.text }}>{p.label}</span>
      )}
    </a>
  );
};

// ==================== FOOTER LINK GROUP ====================

export const FooterLinkGroup: React.FC<FooterLinkGroupProps> = ({
  title,
  links,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    },
    title: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--color-text)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: 8,
    },
    list: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    link: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      color: 'var(--color-text-muted)',
      textDecoration: 'none',
      fontSize: 14,
      transition: 'color 0.15s',
    },
    badge: {
      padding: '2px 6px',
      background: 'var(--color-accent)',
      color: '#fff',
      fontSize: 10,
      fontWeight: 600,
      borderRadius: 4,
      textTransform: 'uppercase',
    },
  };

  return (
    <div style={styles.container as any}>
      <h4 style={styles.title}>{title}</h4>
      <div style={styles.list as any}>
        {links.map((link, index) => (
          <a
            key={index}
            href={link.href}
            style={styles.link}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--color-text)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)';
            }}
          >
            {link.label}
            {link.badge && <span style={styles.badge}>{link.badge}</span>}
          </a>
        ))}
      </div>
    </div>
  );
};

// ==================== SKIP LINK ====================

interface SkipLinkProps {
  href: string;
  children?: React.ReactNode;
}

export const SkipLink: React.FC<SkipLinkProps> = ({
  href,
  children = 'Skip to main content',
}) => {
  const styles: React.CSSProperties = {
    position: 'absolute',
    top: -9999,
    left: 0,
    padding: '12px 24px',
    background: 'var(--color-accent)',
    color: '#fff',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 500,
    borderRadius: 8,
    zIndex: 9999,
  };

  return (
    <a
      href={href}
      style={styles}
      onFocus={(e) => {
        (e.currentTarget as HTMLElement).style.top = '8px';
        (e.currentTarget as HTMLElement).style.left = '8px';
      }}
      onBlur={(e) => {
        (e.currentTarget as HTMLElement).style.top = '-9999px';
      }}
    >
      {children}
    </a>
  );
};

// ==================== ANCHOR LINK ====================

interface AnchorLinkProps {
  id: string;
  children: React.ReactNode;
  showIcon?: boolean;
}

export const AnchorLink: React.FC<AnchorLinkProps> = ({
  id,
  children,
  showIcon = true,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    anchor: {
      position: 'absolute',
      top: -80,
      visibility: 'hidden',
    },
    icon: {
      opacity: isHovered ? 1 : 0,
      color: 'var(--color-text-muted)',
      textDecoration: 'none',
      transition: 'opacity 0.15s',
      cursor: 'pointer',
    },
  };

  const handleClick = () => {
    const url = new URL(window.location.href);
    url.hash = id;
    navigator.clipboard.writeText(url.toString());
  };

  return (
    <div
      style={styles.container as any}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div id={id} style={styles.anchor as any} />
      {children}
      {showIcon && (
        <a href={`#${id}`} style={styles.icon} onClick={handleClick}>
          link
        </a>
      )}
    </div>
  );
};

// ==================== BACK LINK ====================

interface BackLinkProps {
  href?: string;
  onClick?: () => void;
  children?: React.ReactNode;
}

export const BackLink: React.FC<BackLinkProps> = ({
  href,
  onClick,
  children = 'Back',
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const styles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    color: isHovered ? 'var(--color-text)' : 'var(--color-text-muted)',
    textDecoration: 'none',
    fontSize: 14,
    cursor: 'pointer',
    transition: 'color 0.15s',
  };

  const content = (
    <>
      <span style={{ fontSize: 16 }}>arrow-left</span>
      {children}
    </>
  );

  if (onClick) {
    return (
      <button
        style={{ ...styles, background: 'none', border: 'none', padding: 0 }}
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {content}
      </button>
    );
  }

  return (
    <a
      href={href}
      style={styles}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {content}
    </a>
  );
};

export default Link;
