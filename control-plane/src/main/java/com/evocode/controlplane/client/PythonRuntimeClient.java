package com.evocode.controlplane.client;

import com.evocode.controlplane.dto.IntentRequest;
import com.evocode.controlplane.dto.RunAcknowledgement;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class PythonRuntimeClient {

    private final RestClient restClient;

    public PythonRuntimeClient(@Value("${python.runtime.base-url}") String baseUrl) {
        this.restClient = RestClient.builder().baseUrl(baseUrl).build();
    }

    public RunAcknowledgement createRun(IntentRequest request) {
        return restClient.post()
            .uri("/runs")
            .contentType(MediaType.APPLICATION_JSON)
            .body(request)
            .retrieve()
            .body(RunAcknowledgement.class);
    }
}
