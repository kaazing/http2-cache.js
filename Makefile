NPM_PACKAGE := $(shell node -e 'process.stdout.write(require("./package.json").name)')
NPM_VERSION := $(shell node -e 'process.stdout.write(require("./package.json").version)')

TMP_PATH    := /tmp/${NPM_PACKAGE}-$(shell date +%s)

REMOTE_NAME ?= origin
REMOTE_REPO ?= $(shell git config --get remote.${REMOTE_NAME}.url)

CURR_HEAD   := $(firstword $(shell git show-ref --hash HEAD | cut -b -6) master)
GITHUB_PROJ := nodeca/${NPM_PACKAGE}


help:
	echo "make help       - Print this help"
	echo "make lint       - Lint sources with JSHint"
	echo "make test       - Run tests"
	echo "make browserify - Build browserified packages"
	echo "make coverage   - Create coverage report"

lint:
	./node_modules/.bin/jshint .

test: lint
	./node_modules/.bin/mocha

coverage:
	rm -rf coverage
	./node_modules/.bin/istanbul coverage node_modules/.bin/_mocha

test-browser: lint
	rm -f ./integration-test/http-cache-tests.js
	./node_modules/.bin/browserify -r ./ -s test/http-cache-test.js > ./integration-test/http-cache-tests.js

browserify:
	rm -rf ./dist
	mkdir dist
	# Browserify
	( printf %s "/* ${NPM_PACKAGE} ${NPM_VERSION} ${GITHUB_PROJ} */" ; \
		./node_modules/.bin/browserify -r ./ -s http2-cache \
		) > dist/http2-cache.js
	# Minify
	./node_modules/.bin/uglifyjs dist/http2-cache.js -c -m \
		--preamble "/* ${NPM_PACKAGE} ${NPM_VERSION} ${GITHUB_PROJ} */" \
		> dist/http2-cache.min.js
	# Update bower package
	#sed -i -r -e \
	#	"s/(\"version\":\s*)\"[0-9]+[.][0-9]+[.][0-9]+\"/\1\"${NPM_VERSION}\"/" \
	#	bower.json
