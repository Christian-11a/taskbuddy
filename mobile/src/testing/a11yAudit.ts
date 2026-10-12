import type { ReactTestInstance } from 'react-test-renderer';
import * as Lucide from 'lucide-react-native';

/**
 * Accessibility audit for a rendered test tree. Test-only: nothing in the app imports it.
 *
 * A control is a host element a screen-reader user can activate: any element with an `onPress`
 * handler (Tap and Pressable keep the handler on the composite, and draw it on a host View), or a
 * host element whose accessibilityRole is one of CONTROL_ROLES. A control has an accessible name
 * when it has an accessibilityLabel, visible text, or a visible descendant with its own label.
 * Subtrees hidden from accessibility are ignored, both as controls and as name sources.
 */

/** Roles that make a host element a control in its own right, even without an onPress. */
export const CONTROL_ROLES: readonly string[] = ['button', 'link', 'tab', 'radio', 'checkbox', 'switch'];

export type AuditedControl = {
  /** The role the control announces, or null when it has none. */
  role: string | null;
  testID: string | null;
  /** Lucide icons drawn inside the control, e.g. ["Bell"]. Shows what an icon-only button is. */
  icons: string[];
  named: boolean;
};

type Node = ReactTestInstance;

/** Every lucide icon component, so a drawn icon can be named in the report. */
const ICON_TYPES = new Set<unknown>(Object.values(Lucide));

const isHost = (node: Node) => typeof node.type === 'string';

/** Props of a node; fragments and text have none, so they read as empty. */
const propsOf = (node: Node): Record<string, any> => node.props ?? {};

const nonEmpty = (value: unknown) => typeof value === 'string' && value.trim() !== '';

function hiddenFromAccessibility(props: Record<string, any>): boolean {
  return props.accessibilityElementsHidden === true
    || props.importantForAccessibility === 'no-hide-descendants'
    || props['aria-hidden'] === true;
}

/** The node, or one of its ancestors, is hidden from accessibility. */
function isHidden(node: Node): boolean {
  for (let current: Node | null = node; current; current = current.parent) {
    if (hiddenFromAccessibility(propsOf(current))) return true;
  }
  return false;
}

/** The host element a control draws: the control itself, or its top-most host descendant. */
function hostOf(node: Node): Node | undefined {
  return isHost(node) ? node : node.findAll(isHost, { deep: false })[0];
}

/** Text drawn under a node, skipping subtrees hidden from accessibility. */
function visibleText(node: Node): string {
  return node.children
    .map(child => (typeof child === 'string' ? child : hiddenFromAccessibility(propsOf(child)) ? '' : visibleText(child)))
    .join('');
}

/** A visible descendant with its own label, such as a labelled image or a nested control. */
function hasLabelledDescendant(node: Node): boolean {
  return node.children.some(child => typeof child !== 'string'
    && !hiddenFromAccessibility(propsOf(child))
    && (nonEmpty(propsOf(child).accessibilityLabel) || hasLabelledDescendant(child)));
}

function isNamed(host: Node): boolean {
  const props = propsOf(host);
  return nonEmpty(props.accessibilityLabel)
    || nonEmpty(props['aria-label'])
    || visibleText(host).trim() !== ''
    || hasLabelledDescendant(host);
}

/** Lucide icons drawn anywhere under the node, by name, once each. */
function iconsIn(node: Node): string[] {
  const names = new Set<string>();
  const visit = (current: Node) => {
    for (const child of current.children) {
      if (typeof child === 'string') continue;
      if (ICON_TYPES.has(child.type) && typeof (child.type as { displayName?: unknown }).displayName === 'string') {
        names.add((child.type as { displayName: string }).displayName);
      }
      visit(child);
    }
  };
  visit(node);
  return [...names];
}

/**
 * Every control under the root, once each (a Tap wraps a Pressable, which draws a View: those share
 * one host and count once). Controls that screen readers cannot reach are left out: those hidden
 * from accessibility, and those with accessible={false} (the sheet's backdrop, for one).
 */
export function auditControls(root: Node): AuditedControl[] {
  const hosts = new Set<Node>();
  for (const node of root.findAll(() => true)) {
    const props = propsOf(node);
    const role = props.accessibilityRole ?? props.role;
    const isControl = typeof props.onPress === 'function' || (isHost(node) && CONTROL_ROLES.includes(role));
    if (!isControl) continue;
    const host = hostOf(node);
    if (host && !isHidden(host) && propsOf(host).accessible !== false) hosts.add(host);
  }
  return [...hosts].map(host => {
    const props = propsOf(host);
    return {
      role: props.accessibilityRole ?? props.role ?? null,
      testID: props.testID ?? null,
      icons: iconsIn(host),
      named: isNamed(host),
    };
  });
}

/** The controls that a screen reader would announce with no name: icon-only buttons, mostly. */
export function findUnnamedControls(root: Node): Omit<AuditedControl, 'named'>[] {
  return auditControls(root)
    .filter(control => !control.named)
    .map(({ role, testID, icons }) => ({ role, testID, icons }));
}
