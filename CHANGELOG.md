# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased](https://github.com/atomist/sdm-pack-k8s/compare/1.0.1...HEAD)

### Added

-   Support more environments that just staging, production, and independent. [#17](https://github.com/atomist/sdm-pack-k8s/issues/17)
-   Support Kubernetes credential helpers enhancement. [#25](https://github.com/atomist/sdm-pack-k8s/issues/25)

### Changed

-   Consolidate deploy execution.
-   Override goal success message to provide environment and namespace. [#22](https://github.com/atomist/sdm-pack-k8s/issues/22)
-   Update dependencies. [#23](https://github.com/atomist/sdm-pack-k8s/pull/23)
-   Migrate to sdm-pack-k8s. [#28](https://github.com/atomist/sdm-pack-k8s/issues/28)

### Fixed

-   An ingress with no rules must be deleted. [#26](https://github.com/atomist/sdm-pack-k8s/issues/26)

## [1.0.1](https://github.com/atomist/sdm-pack-k8s/compare/1.0.0-RC.2...1.0.1) - 2018-11-09

### Changed

-   Harmonize deployment logic. [#18](https://github.com/atomist/sdm-pack-k8s/pull/18)

## [1.0.0-RC.2](https://github.com/atomist/sdm-pack-k8s/compare/1.0.0-RC.1...1.0.0-RC.2) - 2018-10-30

### Changed

-   Update TypeScript config, clean up some things. [#13](https://github.com/atomist/sdm-pack-k8s/pull/13)
-   Move deploy event and undeploy command. [86dedbf](https://github.com/atomist/sdm-pack-k8s/commit/86dedbf60f904860d1e1ad1fa9b982be845b8cdd)
-   Fix `externalUrls`. [#15](https://github.com/atomist/sdm-pack-k8s/pull/15)

## [1.0.0-RC.1](https://github.com/atomist/sdm-pack-k8s/compare/1.0.0-M.5...1.0.0-RC.1) - 2018-10-15

### Changed

-   Update dependencies.

### Fixed

-   Fix serialization of deployment and service patches.
-   Fix goal environment.

## [1.0.0-M.5](https://github.com/atomist/sdm-pack-k8s/compare/1.0.0-M.4...1.0.0-M.5) - 2018-09-26

### Changed

-   Update dependencies.

## [1.0.0-M.4](https://github.com/atomist/sdm-pack-k8s/compare/1.0.0-M.3...1.0.0-M.4) - 2018-09-16

### Added

-   Encode environment into K8 deployment endpoint. [#7](https://github.com/atomist/sdm-pack-k8s/issues/7)

### Changed

-   Reorganized to standard Node.js package layout.

### Fixed

-   Fix test. [#8](https://github.com/atomist/sdm-pack-k8s/pull/8)

## [1.0.0-M.3](https://github.com/atomist/sdm-pack-k8s/compare/1.0.0-M.1...1.0.0-M.3) - 2018-09-04

### Added

-   Add k8 deploy support for local mode. [bd7b033](https://github.com/atomist/sdm-pack-k8s/commit/bd7b0331535b20eb9659d58bf69c4c302c723b05)

## [1.0.0-M.1](https://github.com/atomist/sdm-pack-k8s/compare/0.1.2...1.0.0-M.1) - 2018-08-27

### Changed

-   Update dependencies.

## [0.1.2](https://github.com/atomist/sdm-pack-k8s/compare/0.1.1...0.1.2) - 2018-08-22

### Changed

-   Update dependencies.

## [0.1.1](https://github.com/atomist/sdm-pack-k8s/compare/0.1.0...0.1.1) - 2018-07-05

### Changed

-   Update dependencies.
-   Update to latest API.

## [0.1.0](https://github.com/atomist/sdm-pack-k8s/tree/0.1.0) - 2018-06-25

### Added

-   Everything
