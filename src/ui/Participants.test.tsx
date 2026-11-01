import { act, create } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { ParticipantRow } from './Participants';

const user = { id: 'person', name: 'Giovanni Bardelli Darcourt', color: '#5ab0ff', image: 'https://images.example.com/profile.jpg' };
describe('participant identity', () => {
  it('uses the actual profile image and preserves the full name for truncated rows', () => {
    const renderer = create(<ParticipantRow user={user} status="self"/>);
    expect(renderer.root.findByType('img').props.src).toBe(user.image);
    expect(renderer.root.findByProps({ className: 'participant-name' }).props.title).toBe(user.name);
    expect(renderer.root.findByProps({ className: 'participant-status is-self' }).children.at(-1)).toBe('TÚ');
    renderer.unmount();
  });
  it('uses a neutral user icon when a photo is absent or fails to load, and retries a changed photo', () => {
    const renderer = create(<ParticipantRow user={user} status="watching"/>);
    act(() => renderer.root.findByType('img').props.onError());
    expect(renderer.root.findAllByType('img')).toHaveLength(0);
    act(() => renderer.update(<ParticipantRow user={{...user,image:'https://images.example.com/new.jpg'}} status="watching"/>));
    expect(renderer.root.findByType('img').props.src).toContain('new.jpg');
    act(() => renderer.update(<ParticipantRow user={{...user,image:null}} status="watching"/>));
    expect(renderer.root.findAllByType('img')).toHaveLength(0);
    renderer.unmount();
  });
  it.each([['watching','MIRANDO'],['editing','EDITANDO'],['moving','MOVIENDO']] as const)('shows an uppercase %s status with an icon', (status, label) => {
    const renderer = create(<ParticipantRow user={user} status={status}/>);
    const badge = renderer.root.findByProps({className:`participant-status is-${status}`});
    expect(badge.children.at(-1)).toBe(label);
    expect(badge.findAllByType('svg')).toHaveLength(1);
    renderer.unmount();
  });
});
