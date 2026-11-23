# fAIr Validate

An installable web app for checking fAIr training datasets and predictions one tile at a time: swipe right for Yes, left for No. Offline, it shows tiles it loaded earlier and every tile of a project saved for offline. Answers stay on the device until they can be sent. It uses the fAIr [validation endpoints](https://github.com/hotosm/fAIr/blob/develop/docs/architecture/api.md#validation-endpoints). The app does not send fAIr sign-in credentials, so every answer it sends is a guest answer.

## Run it

```bash
pnpm install
pnpm dev
pnpm test
pnpm build && pnpm preview
```
