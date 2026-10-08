# Changelog
This project adheres to [Semantic Versioning](http://semver.org/).

## 0.2.2
* Point links and web pages to @html_to_pdf_bot

## 0.2.1
* Point the news channel at @unary_bots

## 0.2.0
* Read pictures, photos and scanned PDFs with @llamaindex/liteparse
* Accept photos
* Queue OCR separately from document conversion
* Refuse pictures past the OCR queue limit
* Kill an OCR worker over the memory limit
* Read Russian as well as English
* Refuse a picture or page declaring more pixels than the limit
* Note low confidence and skipped pages in the output
* Show a separate progress message while reading a picture

## 0.1.3
* Keep the admin chat out of the statistics

## 0.1.2
* Run under pm2 in fork mode, so a deploy cannot poll the bot token twice

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
