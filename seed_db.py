import firebase_admin
from firebase_admin import credentials, firestore

# 1. Authenticate with your downloaded JSON key
cred = credentials.Certificate("serviceAccountKey.json")
if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)

# 2. Connect to Firestore
db = firestore.client()
collection_name = "coding_bank"

def delete_collection(coll_ref, batch_size=50):
    """Deletes all documents in a collection to ensure a clean slate."""
    docs = coll_ref.limit(batch_size).stream()
    deleted = 0
    for doc in docs:
        doc.reference.delete()
        deleted += 1
    if deleted >= batch_size:
        return delete_collection(coll_ref, batch_size)

print(f"🧹 Clearing existing documents in '{collection_name}' collection...")
delete_collection(db.collection(collection_name))
print("✅ Collection cleared.")

# 3. The Upgraded Fallback Questions Dataset
# Inputs are strictly space-separated so candidate code can easily read from stdin.
# I/O Boilerplate is injected into all languages.
fallback_questions = [
    {
        "id": "easy-01",
        "title": "Valid Anagram",
        "difficulty": "Easy",
        "description": "Given two strings `s` and `t`, return `true` if `t` is an anagram of `s`, and `false` otherwise.",
        "starter_code": {
            "java": "import java.util.Scanner;\n\npublic class Main {\n    public static boolean isAnagram(String s, String t) {\n        // Write your Java solution here\n        return false;\n    }\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (sc.hasNext()) {\n            System.out.print(isAnagram(sc.next(), sc.next()));\n        } else {\n            System.out.print(\"No input provided.\");\n        }\n        sc.close();\n    }\n}",
            "python": "import sys\n\ndef isAnagram(s: str, t: str) -> bool:\n    # Write your Python solution here\n    pass\n\nif __name__ == '__main__':\n    input_data = sys.stdin.read().split()\n    if len(input_data) >= 2:\n        print(str(isAnagram(input_data[0], input_data[1])).lower())",
            "cpp": "#include <iostream>\n#include <string>\nusing namespace std;\n\nbool isAnagram(string s, string t) {\n    // Write your C++ solution here\n    return false;\n}\n\nint main() {\n    string s, t;\n    if (cin >> s >> t) {\n        cout << (isAnagram(s, t) ? \"true\" : \"false\");\n    }\n    return 0;\n}",
            "javascript": "const fs = require('fs');\n\nfunction isAnagram(s, t) {\n    // Write your JS solution here\n    return false;\n}\n\nconst input = fs.readFileSync('/dev/stdin').toString().trim().split(/\\s+/);\nif(input.length >= 2) {\n    console.log(isAnagram(input[0], input[1]));\n}"
        },
        "visible_test_cases": [
            {"input": "anagram nagaram", "expected_output": "true"},
            {"input": "rat car", "expected_output": "false"},
            {"input": "a ab", "expected_output": "false"}
        ],
        "hidden_test_cases": [
            {"input": "listen silent", "expected_output": "true"},
            {"input": "triangle integral", "expected_output": "true"},
            {"input": "apple papel", "expected_output": "true"},
            {"input": "hello world", "expected_output": "false"},
            {"input": "a a", "expected_output": "true"},
            {"input": "ab ba", "expected_output": "true"},
            {"input": "coding nocdig", "expected_output": "true"},
            {"input": "test tset", "expected_output": "true"},
            {"input": "software hardware", "expected_output": "false"},
            {"input": "qwerty ytrewq", "expected_output": "true"}
        ]
    },
    {
        "id": "med-01",
        "title": "Longest Substring Without Repeating",
        "difficulty": "Medium",
        "description": "Given a string `s`, find the length of the longest substring without repeating characters.",
        "starter_code": {
            "java": "import java.util.Scanner;\n\npublic class Main {\n    public static int lengthOfLongestSubstring(String s) {\n        // Write your Java solution here\n        return 0;\n    }\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (sc.hasNext()) {\n            System.out.print(lengthOfLongestSubstring(sc.next()));\n        }\n        sc.close();\n    }\n}",
            "python": "import sys\n\ndef lengthOfLongestSubstring(s: str) -> int:\n    # Write your Python solution here\n    pass\n\nif __name__ == '__main__':\n    input_data = sys.stdin.read().split()\n    if input_data:\n        print(lengthOfLongestSubstring(input_data[0]))",
            "cpp": "#include <iostream>\n#include <string>\nusing namespace std;\n\nint lengthOfLongestSubstring(string s) {\n    // Write your C++ solution here\n    return 0;\n}\n\nint main() {\n    string s;\n    if (cin >> s) {\n        cout << lengthOfLongestSubstring(s);\n    }\n    return 0;\n}",
            "javascript": "const fs = require('fs');\n\nfunction lengthOfLongestSubstring(s) {\n    // Write your JS solution here\n    return 0;\n}\n\nconst input = fs.readFileSync('/dev/stdin').toString().trim().split(/\\s+/);\nif(input.length >= 1) {\n    console.log(lengthOfLongestSubstring(input[0]));\n}"
        },
        "visible_test_cases": [
            {"input": "abcabcbb", "expected_output": "3"},
            {"input": "bbbbb", "expected_output": "1"},
            {"input": "pwwkew", "expected_output": "3"}
        ],
        "hidden_test_cases": [
            {"input": "dvdf", "expected_output": "3"},
            {"input": "au", "expected_output": "2"},
            {"input": "aab", "expected_output": "2"},
            {"input": "cdd", "expected_output": "2"},
            {"input": "abba", "expected_output": "2"},
            {"input": "tmmzuxt", "expected_output": "5"},
            {"input": "abcdef", "expected_output": "6"},
            {"input": "a", "expected_output": "1"},
            {"input": "zxyzxyz", "expected_output": "3"},
            {"input": "abacabad", "expected_output": "4"}
        ]
    },
    {
        "id": "hard-01",
        "title": "Minimum Window Substring",
        "difficulty": "Hard",
        "description": "Given two strings `s` and `t`, return the minimum window substring of `s` such that every character in `t` (including duplicates) is included in the window. If there is no such substring, return an empty string `\"\"`.",
        "starter_code": {
            "java": "import java.util.Scanner;\n\npublic class Main {\n    public static String minWindow(String s, String t) {\n        // Write your Java solution here\n        return \"\";\n    }\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (sc.hasNext()) {\n            System.out.print(minWindow(sc.next(), sc.next()));\n        }\n        sc.close();\n    }\n}",
            "python": "import sys\n\ndef minWindow(s: str, t: str) -> str:\n    # Write your Python solution here\n    pass\n\nif __name__ == '__main__':\n    input_data = sys.stdin.read().split()\n    if len(input_data) >= 2:\n        print(minWindow(input_data[0], input_data[1]))",
            "cpp": "#include <iostream>\n#include <string>\nusing namespace std;\n\nstring minWindow(string s, string t) {\n    // Write your C++ solution here\n    return \"\";\n}\n\nint main() {\n    string s, t;\n    if (cin >> s >> t) {\n        cout << minWindow(s, t);\n    }\n    return 0;\n}",
            "javascript": "const fs = require('fs');\n\nfunction minWindow(s, t) {\n    // Write your JS solution here\n    return \"\";\n}\n\nconst input = fs.readFileSync('/dev/stdin').toString().trim().split(/\\s+/);\nif(input.length >= 2) {\n    console.log(minWindow(input[0], input[1]));\n}"
        },
        "visible_test_cases": [
            {"input": "ADOBECODEBANC ABC", "expected_output": "BANC"},
            {"input": "a a", "expected_output": "a"},
            {"input": "a aa", "expected_output": ""}
        ],
        "hidden_test_cases": [
            {"input": "ab b", "expected_output": "b"},
            {"input": "bba ab", "expected_output": "ba"},
            {"input": "cabwefgewcwaefgcf cae", "expected_output": "cwae"},
            {"input": "xyz y", "expected_output": "y"},
            {"input": "x yz", "expected_output": ""},
            {"input": "aa a", "expected_output": "a"},
            {"input": "aa aa", "expected_output": "aa"},
            {"input": "thisisatest t", "expected_output": "t"},
            {"input": "helloworld owo", "expected_output": "oworl"},
            {"input": "abcde cde", "expected_output": "cde"}
        ]
    }
]

# 4. Loop through and push to Firestore
print("Initiating upload to Google Cloud Firestore...")
for q in fallback_questions:
    doc_ref = db.collection(collection_name).document(q["id"])
    doc_ref.set(q)
    print(f"✅ Successfully seeded [{q['difficulty']}] question: {q['title']} (with 10 hidden test cases)")

print("🎉 Database population complete. The coding_bank collection is perfectly configured for Piston execution.")