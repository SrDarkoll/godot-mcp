import fs from 'node:fs/promises';
import type { ProjectFiles } from '../recovery/project-files.js';

const DIMENSIONS = new Set([
    'display/window/size/viewport_width', 'display/window/size/viewport_height',
    'display/window/size/window_width_override', 'display/window/size/window_height_override'
]);
const BOOLEANS = new Set([
    'rendering/2d/snap/snap_2d_transforms_to_pixel',
    'rendering/2d/snap/snap_2d_vertices_to_pixel'
]);
const ENUMS: Readonly<Record<string, readonly unknown[]>> = {
    'display/window/stretch/mode': ['disabled', 'canvas_items', 'viewport'],
    'display/window/stretch/aspect': ['ignore', 'keep', 'keep_width', 'keep_height', 'expand'],
    'display/window/stretch/scale_mode': ['fractional', 'integer'],
    'rendering/textures/canvas_textures/default_texture_filter': [0, 1, 2, 3]
};

async function ordinaryProjectResource(value: unknown, extensions: string[], files: ProjectFiles): Promise<boolean> {
    if (typeof value !== 'string' || !value.startsWith('res://') ||
        value.toLowerCase().startsWith('res://addons/godot_mcp/') ||
        !extensions.some(extension => value.endsWith(extension))) return false;
    try {
        const stat = await fs.lstat(await files.resolve(value));
        return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1;
    } catch {
        // Unknown, unavailable, linked or out-of-project values remain on the approval path.
        return false;
    }
}

/** Only known, bounded project configuration is eligible for the routine permission path. */
export async function isRoutineProjectSetting(args: Record<string, unknown>, files: ProjectFiles): Promise<boolean> {
    const { setting, value } = args;
    if (typeof setting !== 'string' || (args.save !== undefined && typeof args.save !== 'boolean')) return false;
    if (setting === 'application/config/name') return typeof value === 'string' && value.length <= 256 && !value.includes('\0');
    if (setting === 'application/run/main_scene') return ordinaryProjectResource(value, ['.tscn', '.scn'], files);
    if (setting.startsWith('autoload/')) {
        const name = setting.slice('autoload/'.length);
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || name.toLowerCase() === 'godotmcpruntime') return false;
        if (value === null) return true;
        return ordinaryProjectResource(typeof value === 'string' ? value.replace(/^\*/, '') : value, ['.gd', '.tscn', '.scn'], files);
    }
    if (DIMENSIONS.has(setting)) {
        const minimum = setting.endsWith('_override') ? 0 : 1;
        return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= 16384;
    }
    if (BOOLEANS.has(setting)) return typeof value === 'boolean';
    if (Object.hasOwn(ENUMS, setting)) return ENUMS[setting]!.includes(value);
    return false;
}
