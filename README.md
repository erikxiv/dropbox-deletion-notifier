# Dropbox deletion notifier

Sends e-mails whenever files are deleted from Dropbox. Only supports a single user for now.

## Installation

Required environment vars: 

```
DROPBOX_ACCESS_TOKEN=...
DROPBOX_FOLDER=/some_folder_to_monitor
REDIS_URL=redis://...
```

Optional environment vars: 

```
PORT=8080
```

## Usage
To start the development server with watch 

```
$ gulp
```
