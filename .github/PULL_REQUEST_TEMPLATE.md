## Summary

<!-- What changes, and why? -->

## Type of change

- [ ] Feature
- [ ] Security hardening
- [ ] Bug fix
- [ ] Documentation / CI
- [ ] Dependency update

## Security checklist

- [ ] No secrets, tokens, or personal financial data are committed
- [ ] User-controlled data is rendered as text (no unsafe HTML)
- [ ] CSV/export paths still neutralize formula injection
- [ ] New network origins are added to the CSP `connect-src` and justified
- [ ] Dependency changes are pinned and `npm audit --omit=dev` is clean
- [ ] Encryption/storage changes preserve the vault format or include a migration

## Verification

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test:coverage`
- [ ] `npm run test:e2e`
- [ ] `npm run build`
- [ ] `npm run scan:secrets`

## Notes for the reviewer

<!-- Screenshots, threat-model impact, residual risk, follow-ups. -->

🤖 Generated with [Claude Code](https://claude.com/claude-code)
