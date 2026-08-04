# Changelog
This project adheres to [Semantic Versioning](http://semver.org/).

## 0.1.1
* Refuse a ZIP that declares far more inside than its size suggests
* Strip control characters from file names before logging or sending them

## 0.1.0
* Convert documents to Markdown with @firecrawl/anydoc
* Send the result as an .md file, with short text in the caption
* Run every conversion in a child process
* Detect the format from the content, fall back to the file name
* Refuse files over 20 MB before downloading them
* Cap concurrent conversions, queue the rest
* Tell scans, broken files and empty files apart in the reply
* Limit how fast one chat can be served
* Give up on an update after three failed tries
* Record usage in SQLite via node:sqlite
* Store the format instead of the file
* Add admin-only /stats command with tables
