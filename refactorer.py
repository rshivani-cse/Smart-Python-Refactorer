import ast
import time
import subprocess
import shutil
from pathlib import Path
from google import genai

client = genai.Client()


def generate_docstring(function_code):
    prompt = f"""
Write a short, clear Python docstring for this function.

Function:
{function_code}

Return only the docstring text. Do not include triple quotes.
"""

    for attempt in range(3):
        try:
            chat = client.chats.create(model="gemini-3.5-flash-lite")
            response = chat.send_message(prompt)
            return response.text.strip()

        except Exception as e:
            print(f"Gemini request failed on attempt {attempt + 1}/3: {e}")

            if attempt < 2:
                print("Retrying in 2 seconds...")
                time.sleep(2)

    raise Exception(
        "Gemini request failed after 3 attempts. Please try again later."
    )

def insert_docstring(source_code, function, docstring):
    lines = source_code.splitlines()

    insert_line = function.lineno

    lines.insert(insert_line, f'    """{docstring}"""')

    return "\n".join(lines)

def validate_syntax(source_code):
    try:
        ast.parse(source_code)
        return True
    except SyntaxError:
        return False

def validate_logic(original_code, modified_code):
    original_tree = ast.parse(original_code)
    modified_tree = ast.parse(modified_code)

    for node in ast.walk(original_tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            node.body = [
                item for item in node.body
                if not (
                    isinstance(item, ast.Expr)
                    and isinstance(item.value, ast.Constant)
                    and isinstance(item.value.value, str)
                )
            ]

    for node in ast.walk(modified_tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            node.body = [
                item for item in node.body
                if not (
                    isinstance(item, ast.Expr)
                    and isinstance(item.value, ast.Constant)
                    and isinstance(item.value.value, str)
                )
            ]

    return ast.dump(original_tree) == ast.dump(modified_tree)

def run_program(file_path):
    result = subprocess.run(
        ["python", file_path],
        capture_output=True,
        text=True,
        timeout=10
    )

    return result.stdout, result.stderr, result.returncode

def validate(original_code, modified_code, file_path):
    syntax_valid = validate_syntax(modified_code)

    if not syntax_valid:
        return False

    logic_valid = validate_logic(original_code, modified_code)

    if not logic_valid:
        return False

    original_file = Path("original_temp.py")
    modified_file = Path("modified_temp.py")

    original_file.write_text(original_code)
    modified_file.write_text(modified_code)

    original_output, original_errors, original_return_code = run_program(
        str(original_file)
    )

    modified_output, modified_errors, modified_return_code = run_program(
        str(modified_file)
    )

    original_file.unlink()
    modified_file.unlink()

    execution_valid = (
        original_return_code == 0
        and modified_return_code == 0
        and original_output == modified_output
    )

    return execution_valid

def find_undocumented(file_path):
    source_code = Path(file_path).read_text()
    tree = ast.parse(source_code)

    undocumented = []

    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            if ast.get_docstring(node) is None:
                undocumented.append(node)

    return undocumented



def main(file_path="sample.py"):
    file_path = Path(file_path)
    backup_path = file_path.with_suffix(".backup.py")

    if not file_path.is_file():
        print(f"Error: File not found: {file_path}")
        return {
            "status": "error",
            "message": f"File not found: {file_path}",
            "filename": file_path.name,
            "functions_updated": 0,
            "validation_passed": None,
            "output_file": None
        }

    original_code = file_path.read_text(encoding="utf-8")
    shutil.copy2(file_path, backup_path)

    try:
        functions = find_undocumented(str(file_path))

        if not functions:
            print("No refactoring needed.")
            print("All functions already have docstrings.")
            print("Your file is already documented.")

            return {
                "status": "no_changes_needed",
                "message": "All functions already have docstrings.",
                "filename": file_path.name,
                "functions_updated": 0,
                "validation_passed": None,
                "output_file": str(file_path)
            }

        for function in functions:
            print("Function without docstring:", function.name)

        source_code = original_code
        updated_functions = []

        for function in reversed(functions):
            function_code = ast.get_source_segment(
                source_code, function
            )

            docstring = generate_docstring(function_code)

            print("Function:", function.name)
            print("Generated docstring:", docstring)

            source_code = insert_docstring(
                source_code,
                function,
                docstring
            )

            updated_functions.append({
                "function_name": function.name,
                "docstring": docstring
            })

        file_path.write_text(source_code, encoding="utf-8")
        print("Updated", file_path.name, "successfully.")

        print("Validation started...")

        validation_result = validate(
            original_code,
            source_code,
            str(file_path)
        )

        print("Validation result:", validation_result)

        if not validation_result:
            shutil.copy2(backup_path, file_path)
            print("Validation failed. Original file restored.")

            return {
                "status": "validation_failed",
                "message": "Validation failed. Original file restored.",
                "filename": file_path.name,
                "functions_updated": 0,
                "generated_docstrings": updated_functions,
                "validation_passed": False,
                "output_file": str(file_path)
            }

        print("Validation passed. Changes kept.")

        return {
            "status": "success",
            "message": "Refactoring completed and validation passed.",
            "filename": file_path.name,
            "functions_updated": len(updated_functions),
            "generated_docstrings": updated_functions,
            "validation_passed": True,
            "output_file": str(file_path)
        }

    except Exception as e:
        shutil.copy2(backup_path, file_path)
        print("Error during refactoring:", e)
        print("Original file restored.")

        return {
            "status": "error",
            "message": "Refactoring failed. Please try again later.",
            "filename": file_path.name,
            "functions_updated": 0,
            "validation_passed": None,
            "output_file": str(file_path)
        }


if __name__ == "__main__":
    result = main()
    print("\nFinal result:")
    print(result)


