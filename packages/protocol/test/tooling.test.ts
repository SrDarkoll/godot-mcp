import { describe, expect, it } from 'vitest';
import {
  ToolCatalogEntrySchema, ToolDiscoveryParamsSchema, ToolDiscoveryResultSchema,
  ToolDomainSchema, ToolProfileSchema
} from '../src/index.js';

describe('tooling contracts', () => {
  it('accepts exactly the bounded tool profiles and domains', () => {
    expect(ToolProfileSchema.options).toEqual(['minimal','core','2d','3d','navigation','ui','runtime','full']);
    expect(ToolDomainSchema.options).toEqual([
      'core','session','security','recovery','scene','node','object','resource','script','signal','project','editor',
      'runtime','debug','visual','workflow','ui','animation','tilemap','tileset','2d','3d','materials','navigation'
    ]);
    expect(() => ToolProfileSchema.parse('physics')).toThrow();
  });

  it('bounds discovery filters and pagination', () => {
    expect(ToolDiscoveryParamsSchema.parse({})).toEqual({ offset: 0, limit: 25 });
    expect(ToolDiscoveryParamsSchema.parse({ profile:'3d' })).toEqual({ profile:'3d', offset:0, limit:25 });
    expect(ToolDiscoveryParamsSchema.parse({ profile:'3d', activeOnly:false, domain:'navigation', query:'mesh', offset:10, limit:50 }))
      .toMatchObject({ profile:'3d', activeOnly:false, domain:'navigation', query:'mesh', offset:10, limit:50 });
    expect(() => ToolDiscoveryParamsSchema.parse({ query:'x'.repeat(81) })).toThrow();
    expect(() => ToolDiscoveryParamsSchema.parse({ limit:51 })).toThrow();
  });

  it('validates compact catalog and discovery result shapes', () => {
    const entry = ToolCatalogEntrySchema.parse({
      name:'navigation.mesh.bake', domain:'navigation', description:'Bake navigation geometry.', active:true,
      profiles:['2d','3d','navigation','full']
    });
    expect(entry.active).toBe(true);
    expect(ToolDiscoveryResultSchema.parse({
      activeProfile:'3d', selectedProfile:'3d',
      profiles:[
        {id:'minimal',toolCount:5},{id:'core',toolCount:78},{id:'2d',toolCount:121},{id:'3d',toolCount:107},
        {id:'navigation',toolCount:67},{id:'ui',toolCount:81},{id:'runtime',toolCount:30},{id:'full',toolCount:165}
      ],
      total:1, offset:0, limit:25, nextOffset:null, tools:[entry]
    }).tools).toHaveLength(1);
  });
});
