import fs from 'node:fs'
const commit = process.env.APP_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'local-preview'
if (commit !== 'local-preview' && !/^[a-f0-9]{40}$/.test(commit)) throw new Error('Build identity must be a full Git commit SHA')
const basePath = process.env.APP_BASE_PATH || '/'
if (!['/', '/nhl_predictor/'].includes(basePath)) throw new Error('Unsupported app base path')
fs.writeFileSync('dist/version.json', JSON.stringify({ app: 'Blue Line', commit, basePath, data: 'synthetic-contract-fixture' }, null, 2) + '\n')
