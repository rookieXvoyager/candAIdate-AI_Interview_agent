import os
from pathlib import Path

def generate_tree(directory, ignore_dirs=None, ignore_files=None, prefix=""):
    """
    Recursively generates a visual tree structure of the directory.
    """
    # Folders and files to ignore to keep the output clean
    if ignore_dirs is None:
        ignore_dirs = {
            '.git', 'node_modules', '__pycache__', 'venv', '.venv', 
            'env', 'dist', 'build', '.idea', '.vscode'
        }
    if ignore_files is None:
        ignore_files = {
            '.DS_Store', 'generate_tree.py', 'project_structure.txt'
        }
        
    path = Path(directory)
    
    # Get all contents, filter out ignored ones, and sort (Directories first, then files)
    try:
        contents = list(path.iterdir())
    except PermissionError:
        return f"{prefix}└── [Permission Denied]\n"

    contents = [
        c for c in contents 
        if (c.is_dir() and c.name not in ignore_dirs) or 
           (c.is_file() and c.name not in ignore_files)
    ]
    contents.sort(key=lambda x: (not x.is_dir(), x.name.lower()))
    
    tree_output = ""
    pointers = ["├── "] * (len(contents) - 1) + ["└── "] if contents else []
    
    for pointer, path_item in zip(pointers, contents):
        # Add the current item to the tree
        tree_output += f"{prefix}{pointer}{path_item.name}\n"
        
        # If it's a directory, recurse into it
        if path_item.is_dir():
            extension = "│   " if pointer == "├── " else "    "
            tree_output += generate_tree(path_item, ignore_dirs, ignore_files, prefix + extension)
            
    return tree_output

if __name__ == "__main__":
    # Point this to your project root ('.' means the current directory)
    root_dir = "." 
    root_name = Path(root_dir).resolve().name
    
    print("Scanning project structure...")
    
    # Generate the tree starting with the root folder name
    output = f"📁 {root_name}/\n" + generate_tree(root_dir)
    
    # Save the output to a text file
    output_filename = "project_structure.txt"
    with open(output_filename, "w", encoding="utf-8") as f:
        f.write(output)
        
    # Also print a preview to the terminal
    print(f"\n{output}")
    print(f"✅ Success! The complete file structure has been saved to '{output_filename}'.")