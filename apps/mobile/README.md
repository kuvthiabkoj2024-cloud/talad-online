# @talad/mobile — Customer app

Expo SDK 57 (React Native 0.86, Expo Router with native tabs). Customer app for iOS and
Android (scope §4, §8.1). A seller mode or separate shop app can follow the same setup.

```bash
cp .env.example .env
pnpm dev            # Expo dev server — press i / a for simulators
npx expo-doctor     # check dependency health
```

- Screens: `src/app/` (file-based routes) · tabs: `src/components/app-tabs.tsx`
- Always add native libraries with `npx expo install <pkg>` so versions match the SDK.
- Builds and store submission use EAS (`npx eas-cli@latest build`).

See `AGENTS.md` for Expo-specific agent rules.
