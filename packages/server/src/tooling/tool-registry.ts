import type { ToolCatalogEntry, ToolDiscoveryParams, ToolDiscoveryResult, ToolProfile } from '@godot-mcp/protocol';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import { TOOL_CATALOG, TOOL_PROFILES, toolCatalogEntry, toolNamesForProfile } from './tool-catalog.js';

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


  discover(params:ToolDiscoveryParams):ToolDiscoveryResult {
    const selectedProfile=params.profile??this.activeProfile;
    const activeOnly=params.activeOnly??params.profile===undefined;
    const query=params.query?.toLocaleLowerCase();
    let entries=TOOL_CATALOG.filter(entry=>entry.profiles.includes(selectedProfile));
    if(activeOnly) entries=entries.filter(entry=>entry.profiles.includes(this.activeProfile));
    if(params.domain) entries=entries.filter(entry=>entry.domain===params.domain);
    if(query) entries=entries.filter(entry=>entry.name.toLocaleLowerCase().includes(query)||(this.description(entry.name)??'').toLocaleLowerCase().includes(query));
    const total=entries.length;
    const page=entries.slice(params.offset,params.offset+params.limit);
    const tools:ToolCatalogEntry[]=page.map(entry=>({
      name:entry.name,
      domain:entry.domain,
      description:this.requiredDescription(entry.name),
      active:entry.profiles.includes(this.activeProfile),
      profiles:[...entry.profiles]
    }));
    const next=params.offset+tools.length<total?params.offset+tools.length:null;
    return {
      activeProfile:this.activeProfile,
      selectedProfile,
      profiles:TOOL_PROFILES.map(id=>({id,toolCount:toolNamesForProfile(id).length})),
      total,offset:params.offset,limit:params.limit,nextOffset:next,tools
    };
  }

  private requiredDescription(name:string):string {
    const description=this.descriptions.get(name);
    if(!description) throw new Error(`MCP tool declaration missing description: ${name}`);
    return description;
  }

  assertFullyObserved():void {
    const missing=TOOL_CATALOG.filter(entry=>!this.observed.has(entry.name)).map(entry=>entry.name);
    if(missing.length) throw new Error(`Undeclared MCP tool catalog entries: ${missing.join(', ')}`);
  }
}
