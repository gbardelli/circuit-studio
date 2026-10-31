import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(()=>({ requireUser:vi.fn(),roleFor:vi.fn(),publicViewRole:vi.fn(),sql:vi.fn() }));
vi.mock('../../api/_lib/auth.js',()=>({requireUser:mocks.requireUser,json:(body:unknown,status=200)=>new Response(JSON.stringify(body),{status})}));
vi.mock('../../api/_lib/db.js',()=>({...mocks,ready:async()=>{}}));
import { GET, PATCH } from '../../api/projects/[id]';
beforeEach(()=>{vi.resetAllMocks();mocks.requireUser.mockResolvedValue(null);});
describe('public view access',()=>{
  it('opens a published circuit anonymously without exposing member identities',async()=>{
    mocks.publicViewRole.mockResolvedValue('viewer');mocks.sql.mockResolvedValue([{id:'public123',name:'Circuit',link_access:'view'}]);
    const response=await GET(new Request('https://example.test/api/projects/public123'));
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({role:'viewer',guest:true,members:[],owner_id:''});
    expect(mocks.roleFor).not.toHaveBeenCalled();
  });
  it('does not disclose a private, revoked, edit-only or missing project to a guest',async()=>{
    mocks.publicViewRole.mockResolvedValue(null);
    const response=await GET(new Request('https://example.test/api/projects/private1'));
    expect(response.status).toBe(403);expect(mocks.sql).not.toHaveBeenCalled();
  });
  it('rejects anonymous writes even when the project is public',async()=>{
    mocks.publicViewRole.mockResolvedValue('viewer');
    expect((await PATCH(new Request('https://example.test/api/projects/public123',{method:'PATCH',body:JSON.stringify({name:'changed'})}))).status).toBe(401);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it('forces a signed-in owner into read-only mode for a presentation link',async()=>{
    mocks.requireUser.mockResolvedValue({id:'owner'});mocks.roleFor.mockResolvedValue('owner');mocks.sql.mockResolvedValueOnce([{id:'public123'}]).mockResolvedValueOnce([]);
    const response=await GET(new Request('https://example.test/api/projects/public123?view=1'));
    expect((await response.json()).role).toBe('viewer');
  });
});
