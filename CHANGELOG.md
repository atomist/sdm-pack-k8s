# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased](https://github.com/atomist/sdm-pack-k8s/compare/1.3.6...HEAD)

### Added

-   Make data sources configurable, validate app name. [#43](https://github.com/atomist/sdm-pack-k8s/issues/43)

### Fixed

-   Make data sources configurable, validate app name. [#43](https://github.com/atomist/sdm-pack-k8s/issues/43)

## [1.3.6](https://github.com/atomist/sdm-pack-k8s/compare/1.3.5...1.3.6) - 2019-03-12

### Added

-   Register SDM using this pack as cluster provider. [#41](https://github.com/atomist/sdm-pack-k8s/issues/41)

## [1.3.5](https://github.com/atomist/sdm-pack-k8s/compare/1.3.4...1.3.5) - 2019-02-13

### Fixed

-   Fix goal descriptions. [426965a](https://github.com/atomist/sdm-pack-k8s/commit/426965a768f0bbfe152bdba871ea1145d3adad1f)

## [1.3.4](https://github.com/atomist/sdm-pack-k8s/compare/1.3.3...1.3.4) - 2019-02-12

### Fixed

-   Fix goal details instance variable. [82168e1](https://github.com/atomist/sdm-pack-k8s/commit/82168e1d9c5ffcdd109234eda86f557131825471)

## [1.3.3](https://github.com/atomist/sdm-pack-k8s/compare/1.3.2...1.3.3) - 2019-02-12

### Changed

-   Improve goal description prior to deployment. [#32](https://github.com/atomist/sdm-pack-k8s/issues/32)
-   Provide simple description for failure. [#35](https://github.com/atomist/sdm-pack-k8s/issues/35)

## [1.3.2](https://github.com/atomist/sdm-pack-k8s/compare/1.3.1...1.3.2) - 2019-02-09

### Fixed

-   Do not log secrets. [#31](https://github.com/atomist/sdm-pack-k8s/issues/31)

## [1.3.1](https://github.com/atomist/sdm-pack-k8s/compare/1.3.0...1.3.1) - 2019-02-08

### Changed

-   Update @kubernetes/client-node. [c719735](https://github.com/atomist/sdm-pack-k8s/commit/c719735a548628771f8d0f57b10d8b85c14e5117)
-   Remove "k8s" from external URL label. [1560c8b](https://github.com/atomist/sdm-pack-k8s/commit/1560c8bd6a62e8ccc6baba5344bf0e74cabdfdd9)
-   Only log minikube startup listener when it runs. [69da1e9](https://github.com/atomist/sdm-pack-k8s/commit/69da1e92c314c283126c74f5ca4d3030aefaefd1)

## [1.3.0](https://github.com/atomist/sdm-pack-k8s/compare/1.2.0...1.3.0) - 2019-02-07

### Changed

-   Shorten description and endpoint labels. [#30](https://github.com/atomist/sdm-pack-k8s/issues/30)

### Fixed

-   Fix missing progress log. [035b414](https://github.com/atomist/sdm-pack-k8s/commit/035b4145bf6ac3758f36e1cbf67306e95860be93), [b284bcd](https://github.com/atomist/sdm-pack-k8s/commit/b284bcd228f171b3854fe9c2b7401a1f4e03873b)
-   Fix setting error message. [1f8f7b9](https://github.com/atomist/sdm-pack-k8s/commit/1f8f7b984396112b8e162490d6ce4b7e731ef9fe)
-   Properly read error message. [8c3bb08](https://github.com/atomist/sdm-pack-k8s/commit/8c3bb08e80fadd65ca3e6f1b9fcb80803d3e4a24)

## [1.2.0](https://github.com/atomist/sdm-pack-k8s/compare/1.1.0...1.2.0) - 2019-02-06

### Changed

-   List secrets using labelSelector. [#29](https://github.com/atomist/sdm-pack-k8s/issues/29)

## [1.1.0](https://github.com/atomist/sdm-pack-k8s/compare/1.0.1...1.1.0) - 2019-02-06

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
