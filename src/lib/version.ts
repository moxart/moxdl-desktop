// The app's own version, as package.json has it (it is bumped with tauri.conf.json and
// Cargo.toml). Vite takes the one field, not the whole file.
import { version } from "../../package.json";

export const APP_VERSION: string = version;
