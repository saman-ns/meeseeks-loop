#!/usr/bin/env node
import { register } from "tsx/esm/api";
register();
const { href } = new URL("./index.ts", import.meta.url);
await import(href);
