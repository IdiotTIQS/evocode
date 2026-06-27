package com.evocode.controlplane.client;

import com.evocode.controlplane.dto.IntentRequest;
import com.evocode.controlplane.dto.RunResult;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class PythonRuntimeClient {

    private final RestClient restClient;

    public PythonRuntimeClient(@Value("${python.runtime.base-url}") String baseUrl) {
        this.restClient = RestClient.builder()
            .baseUrl(baseUrl)
            .requestFactory(new SimpleClientHttpRequestFactory())
            .build();
    }

    public RunResult createRun(IntentRequest request) {
        return restClient.post()
            .uri("/runs")
            .contentType(MediaType.APPLICATION_JSON)
            .body(request)
            .retrieve()
            .body(RunResult.class);
    }
}
