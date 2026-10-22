import { describe, it, expect, beforeEach } from 'vitest';
import type { UserProfile } from '../../api';
import type { PracticeProblem } from '../../types/algorithm';
import { useAuthStore } from '../useAuthStore';
import { usePracticeStore } from '../usePracticeStore';

const problem = (id: string): PracticeProblem => ({
  id,
  title: id,
  difficulty: 'Easy',
  category: 'Arrays',
  tags: [],
  solved: false,
  description: '',
  starterCode: { c: `// ${id} C starter`, cpp: `// ${id} C++ starter`, java: `// ${id} Java starter`, python: `# ${id} Python starter` },
  testCases: [],
});
const s = () => usePracticeStore.getState();
const select = (p: PracticeProblem) => s().selectProblem(p);

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'u1' } as UserProfile });
  s().reset();
  usePracticeStore.setState({ selectedLanguage: 'cpp' });
  // selectProblem also loads the history; the request is irrelevant here
  usePracticeStore.setState({ fetchSubmissions: async () => {} });
});

describe('practice drafts', () => {
  it('switching language keeps each language\'s edits; switching back restores them, and they can be edited further', () => {
    const p1 = problem('p1');
    select(p1);
    expect(s().userCode).toBe('// p1 C++ starter');
    s().setUserCode('// my C++');
    s().setLanguage('python');
    expect(s().userCode).toBe('# p1 Python starter');
    s().setUserCode('# my Python');
    s().setLanguage('java');
    expect(s().userCode).toBe('// p1 Java starter');

    s().setLanguage('cpp');
    expect(s().userCode).toBe('// my C++');
    s().setUserCode('// my C++, edited again');
    s().setLanguage('python');
    expect(s().userCode).toBe('# my Python');
    s().setLanguage('cpp');
    expect(s().userCode).toBe('// my C++, edited again');
  });

  it('another problem starts from its own starter, never with the previous problem\'s code', () => {
    select(problem('p1'));
    s().setUserCode('// solution for p1');
    select(problem('p2'));
    expect(s().userCode).toBe('// p2 C++ starter');
    s().setLanguage('python');
    expect(s().userCode).toBe('# p2 Python starter');
  });

  it('coming back to a problem restores its draft in the current language', () => {
    select(problem('p1'));
    s().setUserCode('// p1 work');
    select(problem('p2'));
    s().setUserCode('// p2 work');
    select(problem('p1'));
    expect(s().userCode).toBe('// p1 work');
    s().setLanguage('c');
    select(problem('p2'));
    expect(s().userCode).toBe('// p2 C starter');
  });

  it("drafts are not carried over to another account", () => {
    select(problem('p1'));
    s().setUserCode('// u1 private draft');
    useAuthStore.setState({ user: { id: 'u2' } as UserProfile });
    expect(s()).toMatchObject({ drafts: {}, userCode: '', selectedProblem: null });
    select(problem('p1'));
    expect(s().userCode).toBe('// p1 C++ starter');
  });
});
