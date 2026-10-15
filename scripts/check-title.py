"""The reviewed title is data, never executable shell input."""
import os
import re

assert re.fullmatch(
    r'(feat|fix|perf|revert|chore|docs|test|build|ci|refactor|style)(\([^\r\n()]+\))?!?: [^\r\n]+',
    os.environ['PR_TITLE'],
), 'Use a Conventional Commit title with a useful public summary'
