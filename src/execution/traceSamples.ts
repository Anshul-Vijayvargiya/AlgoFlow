/**
 * Example Python programs for the Playground's step-by-step view. On a server with real execution they are simply
 * examples to run. In test mode (the fake provider and the mock API, which never run code) these programs — with
 * exactly this input — are the only ones that can be visualized: their traces were recorded by running the real
 * tracer on them (server/scripts/recordTraceFixtures.ts) and are shown labelled as recorded samples.
 */
export interface TraceSample {
  id: string;
  title: string;
  source: string;
  stdin: string;
}

export const TRACE_SAMPLES: readonly TraceSample[] = [
  {
    id: 'read-and-print',
    title: 'Read numbers and print them',
    source: `# reads integers from standard input and prints each one
import sys

data = [int(x) for x in sys.stdin.read().replace(",", " ").split()]
for i, value in enumerate(data):
    print(f"Element [{i}] = {value}")
`,
    stdin: '8, 3, 5, 1',
  },
  {
    id: 'factorial',
    title: 'Factorial (recursion)',
    source: `def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

result = factorial(4)
print("4! =", result)
`,
    stdin: '',
  },
  {
    id: 'bubble-sort',
    title: 'Bubble sort (list swaps)',
    source: `def bubble_sort(arr):
    n = len(arr)
    for i in range(n - 1):
        for j in range(n - 1 - i):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr

numbers = [5, 2, 4, 1]
bubble_sort(numbers)
print(numbers)
`,
    stdin: '',
  },
  {
    id: 'linked-list',
    title: 'Linked list (objects)',
    source: `class Node:
    def __init__(self, value):
        self.value = value
        self.next = None

head = Node(1)
head.next = Node(2)
head.next.next = Node(3)

total = 0
node = head
while node is not None:
    total += node.value
    node = node.next
print("sum:", total)
`,
    stdin: '',
  },
  {
    id: 'runtime-error',
    title: 'Runtime error (division by zero)',
    source: `def average(values):
    return sum(values) / len(values)

print(average([4, 8]))
print(average([]))
`,
    stdin: '',
  },
];

/** line endings and trailing whitespace do not make a different program */
export const normalizeProgramText = (s: string) => s.replace(/\r\n?/g, '\n').replace(/\s+$/, '');

/** the sample with exactly this program and input, if any */
export function findTraceSample(source: string, stdin: string): TraceSample | undefined {
  const src = normalizeProgramText(source);
  const input = normalizeProgramText(stdin);
  return TRACE_SAMPLES.find(s => normalizeProgramText(s.source) === src && normalizeProgramText(s.stdin) === input);
}
