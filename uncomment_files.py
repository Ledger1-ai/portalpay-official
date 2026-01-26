import os
import re

TARGET_DIR = "/Volumes/Mayor/Build/portalpay-official/src"

def is_fully_commented(lines):
    non_empty = [l for l in lines if l.strip()]
    if not non_empty:
        return False
    commented = [l for l in non_empty if l.strip().startswith("//")]
    # If more than 95% of non-empty lines are commented, assume it's a commented-out file
    return len(commented) / len(non_empty) > 0.95

def uncomment_line(line):
    # Remove leading "// " or "//"
    if line.strip().startswith("// "):
        return line.replace("// ", "", 1)
    if line.strip().startswith("//"):
        return line.replace("//", "", 1)
    return line

count = 0
for root, dirs, files in os.walk(TARGET_DIR):
    for file in files:
        if file.endswith(".tsx") or file.endswith(".ts"):
            path = os.path.join(root, file)
            with open(path, "r") as f:
                lines = f.readlines()
            
            if is_fully_commented(lines):
                print(f"Uncommenting: {path}")
                new_lines = [uncomment_line(line) for line in lines]
                with open(path, "w") as f:
                    f.writelines(new_lines)
                count += 1

print(f"Total files uncommented: {count}")
