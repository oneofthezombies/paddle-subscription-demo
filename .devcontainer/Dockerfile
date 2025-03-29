FROM mcr.microsoft.com/devcontainers/base:debian-12

ENV DEBIAN_FRONTEND=noninteractive

SHELL ["/bin/bash", "-c"]

RUN apt update && \
    apt install -y \
    curl \
    wget \
    unzip \
    git \
    # To open in a browser on the host
    xdg-utils \
    && apt clean && \
    rm -rf "/var/lib/apt/lists/*"

RUN ARCH=$(dpkg --print-architecture) && \
    curl -fsSL -o k6.tar.gz https://github.com/grafana/k6/releases/download/v0.57.0/k6-v0.57.0-linux-$ARCH.tar.gz && \
    mkdir -p k6 && \
    tar -xzf k6.tar.gz -C k6 --strip-components=1 && \
    mv k6/k6 /usr/local/bin/k6 && \
    rm -rf k6.tar.gz k6

USER vscode
ENV HOME="/home/vscode"
RUN echo '' >> ~/.bashrc && \
    echo '################################################################################' >> ~/.bashrc && \
    echo '# Environment variables' >> ~/.bashrc && \
    echo '################################################################################' >> ~/.bashrc && \
    echo '' >> ~/.bashrc

RUN echo '# JavaScript' >> ~/.bashrc && \
    curl -o- https://fnm.vercel.app/install | bash && \
    bash -i -c 'fnm install 22.14.0' && \
    echo '' >> ~/.bashrc

RUN echo '# Aliases' >> ~/.bashrc && \
    echo 'alias ll="ls -alhF --color=auto"' >> ~/.bashrc && \
    echo '' >> ~/.bashrc

WORKDIR /work
