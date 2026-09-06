import type { ToolProfile } from '@godot-mcp/protocol';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import { TOOL_CATALOG, toolCatalogEntry, toolNamesForProfile } from './tool-catalog.js';

export class ToolRegistry {
  private readonly descriptions = new Map<string,string>();
  private readonly observed = new Set<string>();

  constructor(readonly activeProfile:ToolProfile) {}

  registeringRegistrar(base:ToolRegistrar):ToolRegistrar {
    const register = (name:string, config:any, handler:any) => {
      const entry=toolCatalogEntry(name);
      if(!entry) throw new Error(`Uncataloged MCP tool: ${name}`);
      const description=typeof config?.description==='string'?config.description.trim():'';
      if(!description) throw new Error(`MCP tool description is required: ${name}`);
      this.observed.add(name);
      this.descriptions.set(name,description);
      if(entry.profiles.includes(this.activeProfile)) return base.registerTool(name,config,handler);
      return undefined as never;
    };
    return {registerTool:register as ToolRegistrar['registerTool']};
  }

  observedNames():string[]{return [...this.observed].sort((a,b)=>a.localeCompare(b));}
  activeNames():string[]{return toolNamesForProfile(this.activeProfile);}
  description(name:string):string|undefined{return this.descriptions.get(name);}

  assertFullyObserved():void {
    const missing=TOOL_CATALOG.filter(entry=>!this.observed.has(entry.name)).map(entry=>entry.name);
    if(missing.length) throw new Error(`Undeclared MCP tool catalog entries: ${missing.join(', ')}`);
  }
}
