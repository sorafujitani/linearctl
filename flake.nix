{
  description = "linearctl - a focused terminal UI for Linear";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs =
    { self, nixpkgs, ... }:
    let
      systems = [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          inherit (pkgs) lib;
          packageJson = lib.importJSON ./package.json;
          source = lib.fileset.toSource {
            root = ./.;
            fileset = lib.fileset.unions [
              ./bun.lock
              ./package.json
              ./scripts
              ./src
            ];
          };
          dependencySource = lib.fileset.toSource {
            root = ./.;
            fileset = lib.fileset.unions [
              ./bun.lock
              ./package.json
            ];
          };
          nodeModules = pkgs.stdenvNoCC.mkDerivation {
            pname = "linearctl-node-modules";
            inherit (packageJson) version;
            src = dependencySource;
            nativeBuildInputs = [
              pkgs.bun
              pkgs.writableTmpDirAsHomeHook
            ];
            impureEnvVars = lib.fetchers.proxyImpureEnvVars ++ [
              "GIT_PROXY_COMMAND"
              "SOCKS_SERVER"
            ];
            dontConfigure = true;
            dontFixup = true;
            buildPhase = ''
              runHook preBuild
              export BUN_INSTALL_CACHE_DIR="$(mktemp -d)"
              bun install --cpu="*" --frozen-lockfile --ignore-scripts --no-progress --os="*"
              runHook postBuild
            '';
            installPhase = ''
              runHook preInstall
              mkdir -p "$out"
              cp -R node_modules "$out/"
              runHook postInstall
            '';
            outputHash = "sha256-FZRr9bBjpzPLScRtA0dj9UISJYdsQH1Ay9vw7MU6Qyo=";
            outputHashAlgo = "sha256";
            outputHashMode = "recursive";
          };
        in
        {
          default = pkgs.stdenvNoCC.mkDerivation {
            pname = "linearctl";
            inherit (packageJson) version;
            src = source;
            nativeBuildInputs = [ pkgs.bun ];
            configurePhase = ''
              runHook preConfigure
              cp -R ${nodeModules}/node_modules .
              chmod -R u+w node_modules
              runHook postConfigure
            '';
            buildPhase = ''
              runHook preBuild
              bun run scripts/build.ts --outfile dist/linearctl
              runHook postBuild
            '';
            installPhase = ''
              runHook preInstall
              install -Dm755 dist/linearctl "$out/bin/linearctl"
              runHook postInstall
            '';
            doInstallCheck = true;
            installCheckPhase = ''
              "$out/bin/linearctl" --version | grep -F "linearctl ${packageJson.version}"
            '';
            meta = {
              description = packageJson.description;
              homepage = "https://github.com/sorafujitani/linearctl";
              license = lib.licenses.mit;
              mainProgram = "linearctl";
              platforms = systems;
            };
          };
        }
      );

      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${nixpkgs.lib.getExe self.packages.${system}.default}";
          meta.description = "Run linearctl";
        };
      });

      checks = forAllSystems (system: {
        package = self.packages.${system}.default;
      });

      formatter = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        pkgs.nixfmt-tree
      );

      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShellNoCC {
            packages = [
              pkgs.bun
              pkgs.direnv
              pkgs.git
            ];
            shellHook = ''
              echo "linearctl dev shell: bun $(bun --version)"
            '';
          };
        }
      );
    };
}
