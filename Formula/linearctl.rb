class Linearctl < Formula
  desc "Focused terminal UI for Linear"
  homepage "https://github.com/sorafujitani/linearctl"
  url "https://github.com/sorafujitani/linearctl.git", tag: "v0.1.0"
  license "MIT"
  head "https://github.com/sorafujitani/linearctl.git", branch: "main"
  depends_on "bun" => :build

  def install
    system "bun", "install", "--frozen-lockfile", "--ignore-scripts"
    system "bun", "run", "scripts/build.ts", "--outfile", bin/"linearctl"
  end

  test do
    assert_match "linearctl #{version}", shell_output("#{bin}/linearctl --version")
  end
end
