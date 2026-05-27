export function generateMaliciousInputs(): string[] {
  return [
    '../../../etc/passwd',
    '..\\..\\windows\\system32',
    'path/../../secret',
    'file\0name.txt',
    '\0',
    '<script>alert(1)</script>',
    'javascript:void(0)',
    'eval("malicious")',
    'Function("return this")()',
    'a'.repeat(100_000),
    '${process.env.SECRET}',
    '{{constructor.constructor("return this")()}}',
    '%00',
    '%2e%2e%2f',
    'file:///etc/passwd',
    'data:text/html,<script>alert(1)</script>',
  ];
}

export function generateMaliciousObjects(): unknown[] {
  return [
    null,
    undefined,
    '',
    0,
    -1,
    NaN,
    Infinity,
    true,
    [],
    { __proto__: { isAdmin: true } },
    { constructor: { prototype: { isAdmin: true } } },
    { toString: () => { throw new Error('boom'); } },
  ];
}
