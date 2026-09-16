# Aggregation source failures

Built In discovery isolates failures by search seed. If one configured seed fails, other seeds continue and any successfully collected jobs remain eligible for normal downstream filtering. If every Built In seed fails, the adapter fails closed and catalog publication is blocked.

The aggregation CLI prints per-source run counts and stored source error text so GitHub Actions logs expose the underlying source failure instead of only the later catalog validation error.
