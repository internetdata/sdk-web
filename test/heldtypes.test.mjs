// The public types hold what they were before the eight flags and `asn.type` became optional on the
// wire: a program written against the previous release still compiles against dist's declarations.

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import ts from 'typescript';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROGRAM = `${ROOT}held-types-check.ts`;

// Typed as the previous release typed them, each assignment a compile error if the type moved.
const SOURCE = `
import type { Asn, AsnResult, DomainHost, LookupResponse, Result } from './dist/index.js';

export function held(r: Result, raw: LookupResponse, asn: Asn, host: DomainHost): void {
    const flags: boolean[] = [
        r.isCarrier, r.isSatellite, r.isSsh, r.isSmtp, r.isWeb, r.isDnsResolver, r.isBittorrent,
        raw.is_carrier, raw.is_satellite, raw.is_ssh, raw.is_smtp, raw.is_web, raw.is_dns_resolver,
        raw.is_bittorrent,
    ];
    const types: string[] = [asn.type, host.asn.type, r.asn.type, r.raw.asn.type];
    const optional: (boolean | undefined)[] = [r.isBot, raw.is_bot];
    void [flags, types, optional];
}
export type Unused = AsnResult;
`;

test('a program typed against the previous release still compiles', () => {
    const options = {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
        strict: true, noEmit: true, skipLibCheck: true, types: [], lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    };
    const host = ts.createCompilerHost(options);
    const read = host.getSourceFile.bind(host);
    host.getSourceFile = (name, ...rest) => (
        name === PROGRAM ? ts.createSourceFile(name, SOURCE, ts.ScriptTarget.ES2022) : read(name, ...rest)
    );
    const file = host.fileExists.bind(host);
    host.fileExists = (name) => name === PROGRAM || file(name);

    const program = ts.createProgram([PROGRAM], options, host);
    const errors = ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    assert.deepEqual(errors, []);
});
