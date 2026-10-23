import type { ExecutionLanguageId } from '../../api';

/**
 * A complete program per language that reads integers from standard input (separated by spaces, commas or new lines)
 * and prints each one, so Run works straight away with the default input. Java must be `public class Main` on Judge0.
 */
export const STARTER_PROGRAMS: Record<ExecutionLanguageId, string> = {
  c: `// AlgoFlow Playground: reads integers from standard input and prints each one
#include <stdio.h>

int main(void) {
    int value, n = 0;
    while (scanf(" %d", &value) == 1) {
        printf("Element [%d] = %d\\n", n++, value);
        scanf(" ,"); /* skip an optional comma */
    }
    return 0;
}
`,
  cpp: `// AlgoFlow Playground: reads integers from standard input and prints each one
#include <iostream>
#include <vector>

using namespace std;

void processInput(const vector<int>& arr) {
    for (size_t i = 0; i < arr.size(); i++) {
        cout << "Element [" << i << "] = " << arr[i] << endl;
    }
}

int main() {
    vector<int> data;
    int value;
    while (cin >> value) {
        data.push_back(value);
        if (cin.peek() == ',') cin.ignore(); // skip an optional comma
    }
    processInput(data);
    return 0;
}
`,
  java: `// AlgoFlow Playground: reads integers from standard input and prints each one
import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in).useDelimiter("[\\\\s,]+");
        List<Integer> data = new ArrayList<>();
        while (in.hasNextInt()) data.add(in.nextInt());
        for (int i = 0; i < data.size(); i++) {
            System.out.println("Element [" + i + "] = " + data.get(i));
        }
    }
}
`,
  python: `# AlgoFlow Playground: reads integers from standard input and prints each one
import sys

data = [int(x) for x in sys.stdin.read().replace(",", " ").split()]
for i, value in enumerate(data):
    print(f"Element [{i}] = {value}")
`,
};

export const SOURCE_FILE_NAMES: Record<ExecutionLanguageId, string> = {
  c: 'main.c',
  cpp: 'main.cpp',
  java: 'Main.java',
  python: 'main.py',
};

export const DEFAULT_STDIN = '8, 3, 5, 1, 6, 9, 2';
