#!/usr/bin/env bash
set -euo pipefail

readonly src_dir="/src"
readonly work_dir="/work"
readonly artifacts_root="/artifacts"

copy_repo_into_workdir() {
    mkdir -p "${work_dir}"
    find "${work_dir}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +

    tar \
        --exclude=".git" \
        --exclude="node_modules" \
        --exclude="*/node_modules" \
        --exclude=".pnpm-store" \
        --exclude=".turbo" \
        --exclude="coverage" \
        --exclude="*/coverage" \
        --exclude="dist" \
        --exclude="*/dist" \
        --exclude="test-results" \
        --exclude="playwright-report" \
        --exclude="blob-report" \
        --exclude=".tmp-*" \
        --exclude="tmp" \
        --exclude="tmp-*" \
        -cf - \
        -C "${src_dir}" \
        . | tar -xf - -C "${work_dir}"
}

copy_run_artifacts() {
    mkdir -p "${artifacts_root}"

    local run_id
    run_id="$(date +%Y%m%d-%H%M%S)"
    local run_dir="${artifacts_root}/${run_id}"

    mkdir -p "${run_dir}"

    for candidate in test-results blob-report playwright-report; do
        if [[ -d "${work_dir}/${candidate}" ]]; then
            cp -a "${work_dir}/${candidate}" "${run_dir}/${candidate}"
        fi
    done

    printf '%s\n' "${run_dir}" > "${artifacts_root}/last-run.txt"
    printf 'Container artifacts copied to %s\n' "${run_dir}"
}

prepare_tooling() {
    corepack enable
    corepack prepare pnpm@10.33.0 --activate
}

main() {
    copy_repo_into_workdir
    prepare_tooling

    cd "${work_dir}"
    pnpm install --frozen-lockfile

    if [[ "$#" -eq 0 ]]; then
        set -- pnpm e2e:production:test -- --project firefox-desktop
    fi

    set +e
    "$@"
    local status=$?
    set -e

    copy_run_artifacts
    exit "${status}"
}

main "$@"
