#!/usr/bin/env python3
import sys, json

def main():
    input_data = json.load(sys.stdin)
    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})

    # Block non-JPEG screenshots
    if "browser_take_screenshot" in tool_name:
        screenshot_type = tool_input.get("type", "png")
        
        if screenshot_type != "jpeg":
            print("🚫 BLOCKED: Playwright screenshot must use JPEG format", file=sys.stderr)
            print("", file=sys.stderr)
            print("Playwright MCP bug: PNG screenshots fail with media type mismatch", file=sys.stderr)
            print("Solution: Set type='jpeg' in browser_take_screenshot", file=sys.stderr)
            print(f"Current: type='{screenshot_type}' ❌", file=sys.stderr)
            print("Required: type='jpeg' ✅", file=sys.stderr)
            sys.exit(2)  # Block tool execution
    
    sys.exit(0)  # Allow

if __name__ == "__main__":
    main()