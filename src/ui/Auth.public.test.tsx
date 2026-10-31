import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, create } from 'react-test-renderer';
import { CloudShell } from './Auth';

const session = vi.hoisted(()=>vi.fn());
vi.mock('../cloud',()=>({CLERK_KEY:'unused',setSession:session}));
vi.mock('@clerk/react',()=>({ClerkProvider:()=>{throw new Error('A public presentation must not load authentication');},SignIn:()=>null,useAuth:()=>{throw new Error('Unexpected auth dependency');},useUser:()=>null}));
afterEach(()=>vi.unstubAllGlobals());
describe('anonymous presentations',()=>{
  it('opens directly without initializing authentication or inheriting credentials',async()=>{
    vi.stubGlobal('location',{search:'?p=public123&view=1'});
    let tree!: ReturnType<typeof create>;
    act(()=>{tree=create(<CloudShell><main>Public circuit</main></CloudShell>);});
    expect(tree.root.findByType('main').children).toEqual(['Public circuit']);
    const [token,user]=session.mock.lastCall!;expect(user).toBeNull();expect(await token()).toBeNull();
    act(()=>tree.unmount());
  });
});
