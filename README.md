# Dropbox deletion notifier

Sends e-mails whenever files are deleted from Dropbox. Only supports a single user for now.

To enable a new user, go to https://www.dropbox.com/1/oauth2/authorize?response_type=token&client_id=p8jbu7rsoxs6bzj&redirect_uri=https%3A%2F%2Fdropbox-deletion-notifier.herokuapp.com to enable webhook and get an access token

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
