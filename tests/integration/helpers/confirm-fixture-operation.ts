import type {Client} from '@modelcontextprotocol/client';
import {expect} from 'vitest';
// Explicit test-operator approval, restricted to operations exercised on its own fixture.
export async function confirmFixtureOperation(client:Client,name:'scene.reload'|'project.settings.set'|'resource.save'|'object.call',args:Record<string,unknown>){
 const preview=await client.callTool({name,arguments:args});
 expect(preview.structuredContent).toMatchObject({error:{code:'CONFIRMATION_REQUIRED'}});
 const confirmation=(preview.structuredContent as {error:{details:{confirmationToken:string}}}).error.details.confirmationToken;
 return client.callTool({name,arguments:{...args,confirmation}});
}
