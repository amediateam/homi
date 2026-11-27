{{-- The listing source cannot answer (WP-43, `503`), or too many pages were asked from one address (`429`). --}}
@extends('call.layout')

@section('content')
<p class="note">{{ __('call.unavailable', [], $locale) }}</p>
@endsection
