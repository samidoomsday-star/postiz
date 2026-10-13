import ts from 'typescript';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const rows = [];
const apiModule = readFileSync(resolve(root, 'apps/backend/src/api/api.module.ts'), 'utf8');
const authenticated = new Set((apiModule.match(/const authenticatedController = \[([\s\S]*?)\];/)?.[1] || '')
  .match(/[A-Za-z]+Controller/g) || []);
const methods = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'All', 'Options', 'Head']);
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((p) =>
    p.isDirectory() ? walk(resolve(directory, p.name)) : [resolve(directory, p.name)]);
}
function decorators(node) {
  return ts.canHaveDecorators(node) ? ts.getDecorators(node) || [] : [];
}
function callName(d) {
  return ts.isCallExpression(d.expression) ? d.expression.expression.getText() : '';
}
function firstString(d, fallback = '') {
  const arg = ts.isCallExpression(d.expression) ? d.expression.arguments[0] : undefined;
  return arg && ts.isStringLiteralLike(arg) ? arg.text : fallback;
}
function policy(kind, file, method) {
  const name = file.toLowerCase();
  const mutates = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || kind === 'worker';
  const publishing = /posts|autopost|plugs|integration\.trigger|integration\.schedule/.test(name);
  if (/root\.controller|monitor\.controller/.test(name)) {
    return ['operational metadata; inspect response redaction', 'No publication', 'Operational access; do not expose client data', 'T01-03'];
  }
  if (/auth\.controller|oauth\.controller|no\.auth\.integrations/.test(name)) {
    return ['identity/channel grant or callback state', mutates ? 'Identity/channel changes; may call provider OAuth' : 'Identity metadata; provider redirect possible', 'Bind callback/invitation to authorized agency/client; preserve public discovery', 'T01-02;T01-03'];
  }
  return [
    /public\.controller|uploads|widget/.test(name) ? 'public/capability projection or media bytes' : 'current agency/resource scope; client scope not generally enforced',
    publishing && mutates ? 'May create/change publication or trigger provider mutation; inspect service' : mutates ? 'State change or external service request possible; inspect method' : 'Read; GET tools may call provider services',
    publishing ? 'Phase 1 client/action policy + Phase 2 revision/dispatch gate; deny unsupported direct mutations' : 'Phase 1 server client/action policy or explicit server disable; protect projections and media',
    publishing ? 'T01-01;T01-02;T02-01;T02-06' : 'T01-01;T01-03',
  ];
}
function add(source, line, kind, path, method, actor, current) {
  const [scope, effects, planned, cases] = policy(kind, source, method);
  rows.push({ source, line, kind, path, method, actor, data_scope: scope, external_side_effects: effects,
    current_enforcement: current, planned_enforcement: planned, acceptance_cases: cases, evidence: 'static source; runtime coverage only where Phase 0 report states it' });
}

for (const file of walk(resolve(root, 'apps/backend/src')).filter((p) => p.endsWith('.controller.ts'))) {
  const source = readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  for (const cls of ast.statements.filter(ts.isClassDeclaration)) {
    const decorator = decorators(cls).find((d) => callName(d) === 'Controller');
    if (!decorator) continue;
    const prefix = firstString(decorator);
    const controller = cls.name?.text || '';
    const actor = controller === 'PublicIntegrationsController' ? 'org API key / OAuth principal' :
      /WidgetController/.test(controller) ? 'widget capability' :
      authenticated.has(controller) ? 'authenticated organization member' : 'public or route-specific capability/session';
    for (const member of cls.members.filter(ts.isMethodDeclaration)) {
      for (const d of decorators(member).filter((d) => methods.has(callName(d)))) {
        const guards = decorators(member).filter((x) => ['UseGuards', 'CheckPolicies'].includes(callName(x)))
          .map((x) => x.expression.getText(ast)).join('; ');
        add(relative(root, file), ast.getLineAndCharacterOfPosition(member.getStart(ast)).line + 1, 'HTTP',
          '/' + [prefix, firstString(d)].join('/').split('/').filter(Boolean).join('/'), callName(d).toUpperCase(), actor,
          [controller === 'PublicIntegrationsController' ? 'PublicAuthMiddleware' : authenticated.has(controller) ? 'AuthMiddleware' : /WidgetController/.test(controller) ? 'widget auth middleware' : 'route-specific service; inspect method', guards].filter(Boolean).join('; '));
      }
    }
  }
}

const mcpSource = 'libraries/nestjs-libraries/src/chat/start.mcp.ts';
const mcp = readFileSync(resolve(root, mcpSource), 'utf8');
for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-authorization-server', '/.well-known/openid-configuration', '/mcp', '/mcp/:id', '/sse/:id', '/message/:id', '/mcp-oauth-chatgpt', '/mcp-oauth', '/mcp-oauth-claude', '/mcp-oauth-dynamic']) {
  add(mcpSource, mcp.slice(0, Math.max(0, mcp.indexOf(`'${path}'`))).split('\n').length, 'MCP transport', path, 'ALL',
    path.startsWith('/.well-known') ? 'public discovery' : 'API-key/OAuth/relay principal',
    path.startsWith('/.well-known') ? 'public metadata projection' : 'resolveAuth / OAuth middleware / org key lookup; shared tool service context');
}
const tools = 'libraries/nestjs-libraries/src/chat/tools/tool.list.ts';
const toolNames = readFileSync(resolve(root, tools), 'utf8').match(/export const toolList = \[([\s\S]*?)\];/)[1].match(/\w+Tool/g) || [];
for (const name of toolNames) add(tools, 1, 'MCP tool', name, 'TOOL', 'resolved organization principal', 'MCP context; inspect corresponding tool implementation and service');

const upload = 'apps/frontend/src/app/(app)/api/uploads/[[...path]]/route.ts';
add(upload, 25, 'media bytes', '/api/uploads/*; /uploads/* rewrite', 'GET', 'public URL visitor/provider', 'path traversal confinement and range reads; no client authorization in handler');
for (const file of walk(resolve(root, 'libraries/nestjs-libraries/src/integrations/social')).filter((p) => p.endsWith('.ts'))) {
  const source = readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  for (const cls of ast.statements.filter(ts.isClassDeclaration)) {
    for (const member of cls.members.filter(ts.isMethodDeclaration)) {
      const bindings = decorators(member).map(callName).filter((name) => ['Plug', 'InternalPlug', 'Tool'].includes(name));
      for (const binding of bindings) add(relative(root, file), ast.getLineAndCharacterOfPosition(member.getStart(ast)).line + 1,
        `provider ${binding}`, member.name.getText(ast), 'PROVIDER', 'staff/tool/automation channel principal',
        'provider metadata and IntegrationTrigger/plug service; classify each external mutation before enabling scoped principals');
    }
  }
}
const servicePaths = [
  ['libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts', ['createPost', 'startWorkflow', 'changePostStatus', 'changeDate', 'updatePostSettings', 'checkPlugs', 'checkInternalPlug', 'generatePostsDraft']],
  ['libraries/nestjs-libraries/src/database/prisma/autopost/autopost.service.ts', ['schedulePost']],
  ['apps/orchestrator/src/activities/post.activity.ts', ['searchForMissingThreeHoursPosts', 'postSocial', 'postSocialPending', 'postComment', 'checkPostStatus', 'finalizePost', 'updatePost', 'globalPlugs', 'internalPlugs']],
];
for (const [source, names] of servicePaths) {
  const text = readFileSync(resolve(root, source), 'utf8');
  for (const name of names) {
    const match = new RegExp(`(?:async )?${name}\\(`).exec(text);
    if (!match) throw new Error(`Inventory method missing: ${source}:${name}`);
    add(source, text.slice(0, match.index).split('\n').length, 'worker', name, 'INTERNAL', 'service/job identity; originating actor not retained as scoped principal',
      'organization/post lookup and existing retry semantics; no general revision approval gate');
  }
}
for (const file of walk(resolve(root, 'apps/orchestrator/src/workflows')).filter((p) => p.endsWith('.ts'))) {
  add(relative(root, file), 1, 'workflow', relative(resolve(root, 'apps/orchestrator/src/workflows'), file), 'WORKFLOW',
    'Temporal job identity', 'workflow version and shared activity contracts; review direct and delayed side effects');
}
const headers = Object.keys(rows[0]);
const quote = (v) => '"' + String(v).replaceAll('"', '""') + '"';
writeFileSync(resolve(root, 'docs/agency/evidence/entry-paths.csv'), [headers.join(','), ...rows.map((r) => headers.map((h) => quote(r[h])).join(','))].join('\n') + '\n');
console.log(`Inventoried ${rows.length} HTTP, MCP, media, service and workflow surfaces. Static inventory is not runtime coverage.`);
