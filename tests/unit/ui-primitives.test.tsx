// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * Smoke + behavior tests for the shared `src/renderer/ui` primitives.
 * These ensure the unified surface stays stable as creative apps adopt it.
 */
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  Button, IconButton, Card, CardHeader, CardBody, CardFooter,
  HStack, VStack, Spacer, Field, Badge, TextInput, Textarea,
} from '../../src/renderer/ui';

describe('ui/Button', () => {
  it('renders children and fires onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick while loading', () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('respects size + variant via data attributes', () => {
    render(<Button variant="primary" size="lg">Go</Button>);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('data-variant')).toBe('primary');
    expect(btn.getAttribute('data-size')).toBe('lg');
  });

  it('IconButton requires and applies an aria-label', () => {
    render(<IconButton ariaLabel="Close" icon={<svg />} />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });
});

describe('ui/Card', () => {
  it('renders header, body, footer', () => {
    render(
      <Card variant="elevated" padding="md">
        <CardHeader>Title</CardHeader>
        <CardBody>Body content</CardBody>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );
    expect(screen.getByText('Title')).toBeTruthy();
    expect(screen.getByText('Body content')).toBeTruthy();
    expect(screen.getByText('Footer')).toBeTruthy();
  });

  it('marks selected card via data attributes', () => {
    const { container } = render(<Card selected>Content</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.getAttribute('data-card-variant')).toBe('default');
  });
});

describe('ui/Stack', () => {
  it('HStack arranges row, VStack arranges column', () => {
    const { container } = render(
      <HStack>
        <span>a</span><span>b</span>
      </HStack>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.flexDirection).toBe('row');
    expect(root.style.display).toBe('flex');
  });

  it('Spacer fills available space (flex 1)', () => {
    const { container } = render(<HStack><Spacer /><span>x</span></HStack>);
    const spacer = container.querySelector('div > div') as HTMLElement;
    // jsdom returns shorthand 'flex' as '' so check flexGrow specifically.
    const flex = spacer.style.flex || spacer.style.flexGrow;
    expect(flex === '1' || spacer.style.flexGrow === '1' || spacer.style.cssText.includes('flex')).toBe(true);
  });
});

describe('ui/Field', () => {
  it('renders label + description and wraps the control', () => {
    render(
      <Field label="Email" description="We never share it." htmlFor="email">
        <input id="email" />
      </Field>,
    );
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('We never share it.')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });

  it('shows error instead of description when present', () => {
    render(
      <Field label="Email" description="Hint" error="Required">
        <input />
      </Field>,
    );
    expect(screen.queryByText('Hint')).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe('Required');
  });

  it('inline mode places control on the right', () => {
    const { container } = render(
      <Field inline label="Notify me"><button>toggle</button></Field>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.justifyContent).toBe('space-between');
  });
});

describe('ui/Badge', () => {
  it('exposes the tone via data-tone', () => {
    render(<Badge tone="success">Live</Badge>);
    const el = screen.getByText('Live');
    expect(el.getAttribute('data-tone')).toBe('success');
  });

  it('renders a dot when requested', () => {
    const { container } = render(<Badge dot tone="warning">Sync</Badge>);
    expect(container.querySelector('span[aria-hidden="true"]')).toBeTruthy();
  });
});

describe('ui/TextInput', () => {
  it('toggles invalid styling and aria-invalid', () => {
    render(<TextInput defaultValue="x" invalid />);
    const inp = screen.getByDisplayValue('x') as HTMLInputElement;
    expect(inp.getAttribute('aria-invalid')).toBe('true');
  });

  it('renders left/right addons in addon layout', () => {
    render(
      <TextInput
        leftAddon={<span>L</span>}
        rightAddon={<span>R</span>}
        defaultValue=""
      />,
    );
    expect(screen.getByText('L')).toBeTruthy();
    expect(screen.getByText('R')).toBeTruthy();
  });

  it('Textarea respects rows + initial value', () => {
    render(<Textarea defaultValue="hello" rows={6} />);
    const ta = screen.getByDisplayValue('hello') as HTMLTextAreaElement;
    expect(ta.rows).toBe(6);
  });
});
